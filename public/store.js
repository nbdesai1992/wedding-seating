// store.js — localStorage-backed persistence layer for the wedding seating planner.
//
// Replaces the Express/Postgres API: every function returns the same snake_case
// shapes the server routes returned (see src/repo.js + src/app.js), so app.js
// call sites swap mechanically from `api(...)` to `Store.<fn>(...)`.
//
// Dual environment:
//   - Browser (classic script): attaches `window.Store`, a ready instance backed
//     by `window.localStorage`.
//   - Node (CommonJS, for `node --test`): exports `{ createStore, parseCsv,
//     guestsFromCsv, toCsv, STORAGE_KEY, SCHEMA_VERSION }`; tests inject an
//     in-memory storage shim via `createStore(storage)`.
//
// All data lives under ONE namespaced key with a schemaVersion field.
(function () {
  'use strict';

  var STORAGE_KEY = 'wedding-seating:v1';
  var SCHEMA_VERSION = 1;

  // ---------- id + clone helpers ----------
  function uuid() {
    var c = (typeof globalThis !== 'undefined' && globalThis.crypto) ? globalThis.crypto : null;
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
    // RFC4122-ish fallback for very old browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) {
      var r = (Math.random() * 16) | 0;
      var v = ch === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  function pick(obj, keys) {
    var out = {};
    for (var i = 0; i < keys.length; i++) out[keys[i]] = obj[keys[i]] === undefined ? null : obj[keys[i]];
    return out;
  }

  // ---------- CSV: parse + serialize (ported verbatim from src/csv.js) ----------
  // Minimal, dependency-free. Handles quoted fields, escaped quotes (""),
  // commas and newlines inside quotes, CRLF, and a leading BOM.
  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    var s = String(text).replace(/^\uFEFF/, ''); // strip BOM

    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inQuotes) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i++; }
          else { inQuotes = false; }
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else if (c === '\r') {
        // ignore; handled by \n
      } else {
        field += c;
      }
    }
    // trailing field/row
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter(function (r) { return !(r.length === 1 && r[0].trim() === ''); });
  }

  // Turn CSV text into guest objects. Requires a "name" column (tolerant of
  // header casing/spacing and common aliases). Optional email/notes/party.
  function guestsFromCsv(text) {
    var rows = parseCsv(text);
    if (rows.length === 0) return { guests: [], error: 'The file is empty.' };

    var header = rows[0].map(function (h) { return h.trim().toLowerCase(); });
    var nameIdx = header.findIndex(function (h) { return ['name', 'guest', 'guest name', 'full name'].indexOf(h) > -1; });
    var emailIdx = header.findIndex(function (h) { return ['email', 'e-mail', 'email address'].indexOf(h) > -1; });
    var notesIdx = header.findIndex(function (h) { return ['notes', 'note', 'dietary', 'comments'].indexOf(h) > -1; });
    var partyIdx = header.findIndex(function (h) { return ['party', 'group', 'household', 'family'].indexOf(h) > -1; });

    if (nameIdx === -1) {
      return { guests: [], error: 'CSV must have a "name" column.' };
    }

    var guests = [];
    for (var i = 1; i < rows.length; i++) {
      var cells = rows[i];
      var name = (cells[nameIdx] || '').trim();
      if (!name) continue;
      guests.push({
        name: name,
        email: emailIdx > -1 ? (cells[emailIdx] || '').trim() || null : null,
        notes: notesIdx > -1 ? (cells[notesIdx] || '').trim() || null : null,
        party: partyIdx > -1 ? (cells[partyIdx] || '').trim() || null : null,
      });
    }
    if (guests.length === 0) return { guests: [], error: 'No guest rows found under the "name" column.' };
    return { guests: guests, error: null };
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCsv(headers, rows) {
    var lines = [headers.map(csvCell).join(',')];
    for (var i = 0; i < rows.length; i++) lines.push(rows[i].map(csvCell).join(','));
    return lines.join('\r\n') + '\r\n';
  }

  // ---------- fixture presets (ported from src/app.js) ----------
  var FIXTURE_PRESETS = {
    dj:     { label: 'DJ Booth',    shape: 'rect',  w: 140, h: 70 },
    buffet: { label: 'Buffet',      shape: 'rect',  w: 220, h: 70 },
    bar:    { label: 'Bar',         shape: 'rect',  w: 180, h: 70 },
    dance:  { label: 'Dance Floor', shape: 'rect',  w: 260, h: 160 },
    stage:  { label: 'Stage',       shape: 'rect',  w: 240, h: 100 },
    cake:   { label: 'Cake Table',  shape: 'round', w: 90,  h: 90 },
    gifts:  { label: 'Gift Table',  shape: 'rect',  w: 110, h: 70 },
    custom: { label: 'Room Item',   shape: 'rect',  w: 140, h: 90 },
  };

  // Public row shapes (mirror the SELECT column lists in src/repo.js)
  var EVENT_COLS = ['id', 'name', 'event_date', 'venue', 'created_at'];
  var TABLE_COLS = ['id', 'event_id', 'label', 'shape', 'seats', 'x', 'y', 'kind', 'orientation'];
  var GUEST_COLS = ['id', 'event_id', 'name', 'email', 'notes', 'party', 'table_id', 'seat_index'];
  var FIXTURE_COLS = ['id', 'event_id', 'label', 'ftype', 'shape', 'w', 'h', 'x', 'y'];

  // ---------- storage plumbing ----------
  function memoryStorage() {
    var m = Object.create(null);
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
      setItem: function (k, v) { m[k] = String(v); },
      removeItem: function (k) { delete m[k]; },
    };
  }

  function emptyData() {
    return { schemaVersion: SCHEMA_VERSION, seq: 0, events: [], tables: [], guests: [], fixtures: [] };
  }

  // ---------- the store ----------
  function createStore(storage) {
    var backing = storage || memoryStorage();

    function load() {
      var raw = null;
      try { raw = backing.getItem(STORAGE_KEY); } catch (_) { /* storage unavailable */ }
      if (!raw) return emptyData();
      var data;
      try { data = JSON.parse(raw); } catch (_) { return emptyData(); }
      if (!data || data.schemaVersion !== SCHEMA_VERSION || !Array.isArray(data.events)) return emptyData();
      return data;
    }

    function save(data) {
      try { backing.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (_) { /* quota/unavailable: keep going in-memory this call */ }
    }

    function stamp(data) { data.seq += 1; return { created_at: new Date().toISOString(), _seq: data.seq }; }
    function bySeq(a, b) { return a._seq - b._seq; }
    function byName(a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; }
    function findById(arr, id) {
      for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
      return null;
    }
    function eventTables(data, eventId) { return data.tables.filter(function (t) { return t.event_id === eventId; }).sort(bySeq); }
    function eventGuests(data, eventId) { return data.guests.filter(function (g) { return g.event_id === eventId; }).slice().sort(byName); }
    function eventFixtures(data, eventId) { return data.fixtures.filter(function (f) { return f.event_id === eventId; }).sort(bySeq); }
    function requireEvent(data, id) {
      var ev = findById(data.events, id);
      if (!ev) throw new Error('Celebration not found');
      return ev;
    }

    // ---------- events ----------
    async function listEvents() {
      var data = load();
      // newest first (matches ORDER BY created_at DESC; _seq breaks same-ms ties)
      var events = data.events.slice().sort(function (a, b) {
        return b.created_at < a.created_at ? -1 : b.created_at > a.created_at ? 1 : b._seq - a._seq;
      });
      return events.map(function (e) {
        var guests = data.guests.filter(function (g) { return g.event_id === e.id; });
        var row = pick(e, EVENT_COLS);
        row.table_count = data.tables.filter(function (t) { return t.event_id === e.id; }).length;
        row.guest_count = guests.length;
        row.seated_count = guests.filter(function (g) { return g.table_id != null; }).length;
        return row;
      });
    }

    async function createEvent(body) {
      body = body || {};
      var name = String(body.name || '').trim();
      if (!name) throw new Error('A celebration name is required.');
      var data = load();
      var ev = Object.assign({
        id: uuid(),
        name: name,
        event_date: body.event_date || null,
        venue: String(body.venue || '').trim() || null,
      }, stamp(data));
      data.events.push(ev);
      save(data);
      return pick(ev, EVENT_COLS);
    }

    async function getEvent(id) {
      var data = load();
      var ev = requireEvent(data, id);
      var out = pick(ev, EVENT_COLS);
      out.tables = eventTables(data, id).map(function (t) { return pick(t, TABLE_COLS); });
      out.guests = eventGuests(data, id).map(function (g) { return pick(g, GUEST_COLS); });
      out.fixtures = eventFixtures(data, id).map(function (f) { return pick(f, FIXTURE_COLS); });
      return out;
    }

    // ---------- tables ----------
    async function createTable(eventId, body) {
      body = body || {};
      var data = load();
      requireEvent(data, eventId);
      var shape = body.shape === 'long' ? 'long' : 'round';
      var kind = ['head', 'sweetheart'].indexOf(body.kind) > -1 ? body.kind : 'standard';
      var seats = parseInt(body.seats, 10);
      if (!Number.isFinite(seats)) seats = kind === 'sweetheart' ? 2 : (shape === 'long' ? 8 : 6);
      seats = Math.max(1, Math.min(20, seats));
      var existing = data.tables.filter(function (t) { return t.event_id === eventId; }).length;
      var label = String(body.label || '').trim() ||
        (kind === 'head' ? 'Head Table' : kind === 'sweetheart' ? 'Sweetheart' : 'Table ' + (existing + 1));
      var table = Object.assign({
        id: uuid(),
        event_id: eventId,
        label: label,
        shape: shape,
        seats: seats,
        kind: kind,
        orientation: body.orientation === 'vertical' ? 'vertical' : 'horizontal',
        x: Number.isFinite(+body.x) ? +body.x : 120,
        y: Number.isFinite(+body.y) ? +body.y : 120,
      }, stamp(data));
      data.tables.push(table);
      save(data);
      return pick(table, TABLE_COLS);
    }

    async function updateTable(tableId, patch) {
      patch = patch || {};
      var data = load();
      var table = findById(data.tables, tableId);
      if (!table) throw new Error('Table not found');
      if (patch.label !== undefined) table.label = String(patch.label).trim() || 'Table';
      if (patch.shape !== undefined) table.shape = patch.shape === 'long' ? 'long' : 'round';
      if (patch.seats !== undefined) table.seats = Math.max(1, Math.min(20, parseInt(patch.seats, 10) || 1));
      if (patch.kind !== undefined) table.kind = ['head', 'sweetheart'].indexOf(patch.kind) > -1 ? patch.kind : 'standard';
      if (patch.orientation !== undefined) table.orientation = patch.orientation === 'vertical' ? 'vertical' : 'horizontal';
      if (patch.x !== undefined) table.x = +patch.x;
      if (patch.y !== undefined) table.y = +patch.y;
      save(data);
      return pick(table, TABLE_COLS);
    }

    async function deleteTable(tableId) {
      var data = load();
      // guests at this table are freed (matches server: unseat, then delete)
      for (var i = 0; i < data.guests.length; i++) {
        if (data.guests[i].table_id === tableId) {
          data.guests[i].table_id = null;
          data.guests[i].seat_index = null;
        }
      }
      data.tables = data.tables.filter(function (t) { return t.id !== tableId; });
      save(data);
      return { ok: true };
    }

    // ---------- fixtures ----------
    async function createFixture(eventId, body) {
      body = body || {};
      var data = load();
      requireEvent(data, eventId);
      var ftype = FIXTURE_PRESETS[body.ftype] ? body.ftype : 'custom';
      var preset = FIXTURE_PRESETS[ftype];
      var fixture = Object.assign({
        id: uuid(),
        event_id: eventId,
        label: String(body.label || '').trim() || preset.label,
        ftype: ftype,
        shape: preset.shape,
        w: preset.w,
        h: preset.h,
        x: Number.isFinite(+body.x) ? +body.x : 220,
        y: Number.isFinite(+body.y) ? +body.y : 220,
      }, stamp(data));
      data.fixtures.push(fixture);
      save(data);
      return pick(fixture, FIXTURE_COLS);
    }

    async function updateFixture(fixtureId, patch) {
      patch = patch || {};
      var data = load();
      var fx = findById(data.fixtures, fixtureId);
      if (!fx) throw new Error('Room item not found');
      if (patch.label !== undefined) fx.label = String(patch.label).trim() || 'Room Item';
      var nums = ['w', 'h', 'x', 'y'];
      for (var i = 0; i < nums.length; i++) {
        if (patch[nums[i]] !== undefined) fx[nums[i]] = +patch[nums[i]];
      }
      save(data);
      return pick(fx, FIXTURE_COLS);
    }

    async function deleteFixture(fixtureId) {
      var data = load();
      data.fixtures = data.fixtures.filter(function (f) { return f.id !== fixtureId; });
      save(data);
      return { ok: true };
    }

    // ---------- guests ----------
    async function createGuest(eventId, body) {
      body = body || {};
      var data = load();
      requireEvent(data, eventId);
      var name = String(body.name || '').trim();
      if (!name) throw new Error('A guest name is required.');
      var guest = Object.assign({
        id: uuid(),
        event_id: eventId,
        name: name,
        email: String(body.email || '').trim() || null,
        notes: String(body.notes || '').trim() || null,
        party: String(body.party || '').trim() || null,
        table_id: null,
        seat_index: null,
      }, stamp(data));
      data.guests.push(guest);
      save(data);
      return pick(guest, GUEST_COLS);
    }

    // Assign / reassign / unassign. Enforces one-guest-per-seat: the current
    // occupant of the target seat is kicked to unassigned (forgiving drag-swap),
    // matching src/repo.js updateGuest.
    async function updateGuest(guestId, patch) {
      patch = patch || {};
      var data = load();
      var guest = findById(data.guests, guestId);
      if (!guest) throw new Error('Guest not found');

      var nextTable = 'table_id' in patch ? (patch.table_id || null) : guest.table_id;
      var nextSeat = 'seat_index' in patch
        ? (patch.seat_index == null ? null : parseInt(patch.seat_index, 10))
        : guest.seat_index;

      if (nextTable) {
        var t = findById(data.tables, nextTable);
        if (!t || t.event_id !== guest.event_id) throw new Error('That table no longer exists.');
        if (nextSeat == null || !Number.isFinite(nextSeat) || nextSeat < 0 || nextSeat >= t.seats) {
          throw new Error('That seat isn’t available.');
        }
        // free any current occupant of the target seat
        for (var i = 0; i < data.guests.length; i++) {
          var o = data.guests[i];
          if (o.table_id === nextTable && o.seat_index === nextSeat && o.id !== guestId) {
            o.table_id = null;
            o.seat_index = null;
          }
        }
      }

      guest.table_id = nextTable || null;
      guest.seat_index = nextTable ? nextSeat : null;
      save(data);
      return pick(guest, GUEST_COLS);
    }

    async function deleteGuest(guestId) {
      var data = load();
      data.guests = data.guests.filter(function (g) { return g.id !== guestId; });
      save(data);
      return { ok: true };
    }

    // ---------- CSV import / export ----------
    async function importGuestsCsv(eventId, csvText) {
      var data = load();
      requireEvent(data, eventId);
      var raw = csvText == null ? '' : String(csvText);
      if (!raw.trim()) throw new Error('The file is empty.');
      var parsed = guestsFromCsv(raw);
      if (parsed.error) throw new Error(parsed.error);
      var created = [];
      for (var i = 0; i < parsed.guests.length; i++) {
        var g = parsed.guests[i];
        var guest = Object.assign({
          id: uuid(),
          event_id: eventId,
          name: g.name,
          email: g.email || null,
          notes: g.notes || null,
          party: g.party || null,
          table_id: null,
          seat_index: null,
        }, stamp(data));
        data.guests.push(guest);
        created.push(pick(guest, GUEST_COLS));
      }
      save(data);
      return { imported: created.length, guests: created };
    }

    // CSV string matching GET /api/events/:id/export.csv exactly:
    // columns Guest,Email,Party,Table,Seat,Notes; seated rows first ordered by
    // table label then seat; unassigned rows last, "Unassigned", by name.
    async function exportCsv(eventId) {
      var data = load();
      requireEvent(data, eventId);
      var tablesById = {};
      data.tables.forEach(function (t) { tablesById[t.id] = t; });
      var rows = data.guests
        .filter(function (g) { return g.event_id === eventId; })
        .map(function (g) {
          var t = g.table_id != null ? tablesById[g.table_id] : null;
          return {
            name: g.name, email: g.email, notes: g.notes, party: g.party,
            table_label: t ? t.label : null, seat_index: g.seat_index,
          };
        })
        .sort(function (a, b) {
          var an = a.table_label == null ? 1 : 0, bn = b.table_label == null ? 1 : 0;
          if (an !== bn) return an - bn;
          var al = a.table_label || '', bl = b.table_label || '';
          if (al !== bl) return al < bl ? -1 : 1;
          var as = a.seat_index == null ? Infinity : a.seat_index;
          var bs = b.seat_index == null ? Infinity : b.seat_index;
          if (as !== bs) return as - bs;
          return byName(a, b);
        });
      var out = rows.map(function (r) {
        return [
          r.name,
          r.email || '',
          r.party || '',
          r.table_label || 'Unassigned',
          r.table_label && r.seat_index != null ? r.seat_index + 1 : '',
          r.notes || '',
        ];
      });
      return toCsv(['Guest', 'Email', 'Party', 'Table', 'Seat', 'Notes'], out);
    }

    // Download filename matching the server's Content-Disposition.
    async function exportFilename(eventId) {
      var data = load();
      var ev = requireEvent(data, eventId);
      var safe = String(ev.name || 'seating').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'seating';
      return safe + '-seating.csv';
    }

    return {
      listEvents: listEvents,
      createEvent: createEvent,
      getEvent: getEvent,
      createTable: createTable,
      updateTable: updateTable,
      deleteTable: deleteTable,
      createFixture: createFixture,
      updateFixture: updateFixture,
      deleteFixture: deleteFixture,
      createGuest: createGuest,
      updateGuest: updateGuest,
      deleteGuest: deleteGuest,
      importGuestsCsv: importGuestsCsv,
      exportCsv: exportCsv,
      exportFilename: exportFilename,
    };
  }

  var api = {
    createStore: createStore,
    parseCsv: parseCsv,
    guestsFromCsv: guestsFromCsv,
    toCsv: toCsv,
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api; // Node (tests)
  }
  if (typeof window !== 'undefined') {
    var storage;
    try { storage = window.localStorage; } catch (_) { storage = null; } // e.g. blocked cookies
    window.Store = createStore(storage);
  }
})();
