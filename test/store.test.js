// Unit tests for public/store.js — the localStorage-backed persistence layer
// that replaces the Express/Postgres API. Run via: npm test (node --test).
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createStore, parseCsv, guestsFromCsv, toCsv, STORAGE_KEY, SCHEMA_VERSION } = require('../public/store');

// In-memory localStorage stand-in (same surface the store uses in the browser)
function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    _map: m,
  };
}

function freshStore() {
  const storage = memStorage();
  return { store: createStore(storage), storage };
}

// ---------- events ----------

test('events: create → list → get round-trip', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: '  Emma & James  ', event_date: '2026-09-12', venue: ' The Old Barn ' });
  assert.ok(ev.id, 'event has an id');
  assert.equal(ev.name, 'Emma & James');
  assert.equal(ev.event_date, '2026-09-12');
  assert.equal(ev.venue, 'The Old Barn');
  assert.ok(ev.created_at);

  const list = await store.listEvents();
  assert.equal(list.length, 1);
  assert.equal(list[0].id, ev.id);
  assert.equal(list[0].table_count, 0);
  assert.equal(list[0].guest_count, 0);
  assert.equal(list[0].seated_count, 0);

  const full = await store.getEvent(ev.id);
  assert.equal(full.name, 'Emma & James');
  assert.deepEqual(full.tables, []);
  assert.deepEqual(full.guests, []);
  assert.deepEqual(full.fixtures, []);
});

test('events: null date/venue defaults, listEvents newest first', async () => {
  const { store } = freshStore();
  const a = await store.createEvent({ name: 'First' });
  assert.equal(a.event_date, null);
  assert.equal(a.venue, null);
  const b = await store.createEvent({ name: 'Second' });
  const list = await store.listEvents();
  assert.deepEqual(list.map((e) => e.name), ['Second', 'First'], 'newest first');
  assert.equal(list[1].id, a.id);
  assert.ok(b.id !== a.id);
});

test('events: createEvent without a name rejects; getEvent unknown id rejects', async () => {
  const { store } = freshStore();
  await assert.rejects(() => store.createEvent({ name: '   ' }), /name/i);
  await assert.rejects(() => store.getEvent('nope'), /not found/i);
});

test('events: listEvents counts tables, guests and seated guests', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Counts' });
  const t = await store.createTable(ev.id, { shape: 'round', kind: 'standard', seats: 4 });
  await store.importGuestsCsv(ev.id, 'name\nAda\nBob\nCleo\n');
  const full = await store.getEvent(ev.id);
  await store.updateGuest(full.guests[0].id, { table_id: t.id, seat_index: 0 });
  const list = await store.listEvents();
  assert.equal(list[0].table_count, 1);
  assert.equal(list[0].guest_count, 3);
  assert.equal(list[0].seated_count, 1);
});

// ---------- tables ----------

test('tables: create applies server defaults (labels, seat clamp, coords)', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Tables' });

  const t1 = await store.createTable(ev.id, { shape: 'round', kind: 'standard', seats: 8, x: 150, y: 150 });
  assert.equal(t1.label, 'Table 1');
  assert.equal(t1.shape, 'round');
  assert.equal(t1.kind, 'standard');
  assert.equal(t1.orientation, 'horizontal');
  assert.equal(t1.seats, 8);
  assert.equal(t1.x, 150);
  assert.equal(t1.y, 150);
  assert.equal(t1.event_id, ev.id);

  const head = await store.createTable(ev.id, { shape: 'long', kind: 'head', seats: 8 });
  assert.equal(head.label, 'Head Table');
  const sweet = await store.createTable(ev.id, { shape: 'round', kind: 'sweetheart', seats: 2 });
  assert.equal(sweet.label, 'Sweetheart');

  const t4 = await store.createTable(ev.id, { shape: 'round', seats: 99 });
  assert.equal(t4.seats, 20, 'seats clamp to 20');
  assert.equal(t4.label, 'Table 4', 'auto label counts existing tables');
  const t5 = await store.createTable(ev.id, {});
  assert.equal(t5.shape, 'round');
  assert.equal(t5.seats, 6, 'round default seats');
  assert.equal(t5.x, 120);
  assert.equal(t5.y, 120);

  const full = await store.getEvent(ev.id);
  assert.deepEqual(full.tables.map((t) => t.id), [t1.id, head.id, sweet.id, t4.id, t5.id], 'creation order preserved');
});

test('tables: create for unknown event rejects', async () => {
  const { store } = freshStore();
  await assert.rejects(() => store.createTable('missing', { seats: 8 }), /not found/i);
});

test('tables: update patches label/seats/position/orientation with coercion', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Patch' });
  const t = await store.createTable(ev.id, { shape: 'long', seats: 8 });

  const renamed = await store.updateTable(t.id, { label: '  Garden  ' });
  assert.equal(renamed.label, 'Garden');
  const blank = await store.updateTable(t.id, { label: '   ' });
  assert.equal(blank.label, 'Table', 'blank label falls back');

  const clampedLow = await store.updateTable(t.id, { seats: -3 });
  assert.equal(clampedLow.seats, 1);
  const clampedHigh = await store.updateTable(t.id, { seats: 50 });
  assert.equal(clampedHigh.seats, 20);

  const moved = await store.updateTable(t.id, { x: 321.5, y: 42 });
  assert.equal(moved.x, 321.5);
  assert.equal(moved.y, 42);

  const rotated = await store.updateTable(t.id, { orientation: 'vertical' });
  assert.equal(rotated.orientation, 'vertical');
  const back = await store.updateTable(t.id, { orientation: 'anything-else' });
  assert.equal(back.orientation, 'horizontal');

  await assert.rejects(() => store.updateTable('missing', { x: 1 }), /not found/i);
});

test('tables: delete removes the table and unseats its guests', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Del' });
  const t = await store.createTable(ev.id, { seats: 4 });
  const keep = await store.createTable(ev.id, { seats: 4 });
  await store.importGuestsCsv(ev.id, 'name\nAda\nBob\n');
  let full = await store.getEvent(ev.id);
  const [ada, bob] = full.guests;
  await store.updateGuest(ada.id, { table_id: t.id, seat_index: 0 });
  await store.updateGuest(bob.id, { table_id: keep.id, seat_index: 1 });

  const res = await store.deleteTable(t.id);
  assert.deepEqual(res, { ok: true });

  full = await store.getEvent(ev.id);
  assert.deepEqual(full.tables.map((x) => x.id), [keep.id]);
  const adaNow = full.guests.find((g) => g.id === ada.id);
  assert.equal(adaNow.table_id, null, 'guest at deleted table unseated');
  assert.equal(adaNow.seat_index, null);
  const bobNow = full.guests.find((g) => g.id === bob.id);
  assert.equal(bobNow.table_id, keep.id, 'guest at other table untouched');
  assert.equal(bobNow.seat_index, 1);
});

// ---------- fixtures ----------

test('fixtures: create uses presets, custom labels, update, rotate-swap, delete', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Fixtures' });

  const dance = await store.createFixture(ev.id, { ftype: 'dance', x: 480, y: 300 });
  assert.equal(dance.label, 'Dance Floor');
  assert.equal(dance.shape, 'rect');
  assert.equal(dance.w, 260);
  assert.equal(dance.h, 160);
  assert.equal(dance.x, 480);
  assert.equal(dance.y, 300);
  assert.equal(dance.event_id, ev.id);

  const cake = await store.createFixture(ev.id, { ftype: 'cake' });
  assert.equal(cake.shape, 'round');
  assert.equal(cake.w, 90);

  const custom = await store.createFixture(ev.id, { ftype: 'photo-booth', label: ' Photo Booth ' });
  assert.equal(custom.ftype, 'custom', 'unknown ftype falls back to custom');
  assert.equal(custom.label, 'Photo Booth');
  const unnamed = await store.createFixture(ev.id, { ftype: 'custom' });
  assert.equal(unnamed.label, 'Room Item');

  const renamed = await store.updateFixture(dance.id, { label: 'Main Floor' });
  assert.equal(renamed.label, 'Main Floor');
  const rotated = await store.updateFixture(dance.id, { w: dance.h, h: dance.w });
  assert.equal(rotated.w, 160);
  assert.equal(rotated.h, 260);
  const moved = await store.updateFixture(dance.id, { x: 10, y: 20 });
  assert.equal(moved.x, 10);
  assert.equal(moved.y, 20);
  await assert.rejects(() => store.updateFixture('missing', { x: 1 }), /not found/i);

  const res = await store.deleteFixture(cake.id);
  assert.deepEqual(res, { ok: true });
  const full = await store.getEvent(ev.id);
  assert.deepEqual(full.fixtures.map((f) => f.id), [dance.id, custom.id, unnamed.id]);
});

// ---------- guests + seating ----------

test('guests: getEvent returns guests sorted by name with full row shape', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Sort' });
  await store.importGuestsCsv(ev.id, 'name,email,notes,party\nZoe,z@x.com,vegan,Smith\nAda,,,\n');
  const full = await store.getEvent(ev.id);
  assert.deepEqual(full.guests.map((g) => g.name), ['Ada', 'Zoe']);
  const zoe = full.guests[1];
  assert.deepEqual(Object.keys(zoe).sort(), ['email', 'event_id', 'id', 'name', 'notes', 'party', 'seat_index', 'table_id']);
  assert.equal(zoe.email, 'z@x.com');
  assert.equal(zoe.notes, 'vegan');
  assert.equal(zoe.party, 'Smith');
  assert.equal(zoe.table_id, null);
  assert.equal(zoe.seat_index, null);
});

test('guests: seat, reassign, kick occupant, unseat', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Seating' });
  const t = await store.createTable(ev.id, { seats: 4 });
  await store.importGuestsCsv(ev.id, 'name\nAda\nBob\n');
  const full = await store.getEvent(ev.id);
  const [ada, bob] = full.guests;

  const seated = await store.updateGuest(ada.id, { table_id: t.id, seat_index: 2 });
  assert.equal(seated.table_id, t.id);
  assert.equal(seated.seat_index, 2);

  // Bob dropped on Ada's seat: Bob takes it, Ada kicked to unassigned
  await store.updateGuest(bob.id, { table_id: t.id, seat_index: 2 });
  let now = await store.getEvent(ev.id);
  const adaNow = now.guests.find((g) => g.id === ada.id);
  const bobNow = now.guests.find((g) => g.id === bob.id);
  assert.equal(bobNow.seat_index, 2);
  assert.equal(adaNow.table_id, null, 'previous occupant kicked to unassigned');
  assert.equal(adaNow.seat_index, null);

  // unseat (drop back on the panel)
  const unseated = await store.updateGuest(bob.id, { table_id: null, seat_index: null });
  assert.equal(unseated.table_id, null);
  assert.equal(unseated.seat_index, null);
});

test('guests: seat validation — bad table, out-of-range seat, unknown guest', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Valid' });
  const t = await store.createTable(ev.id, { seats: 2 });
  await store.importGuestsCsv(ev.id, 'name\nAda\n');
  const full = await store.getEvent(ev.id);
  const ada = full.guests[0];

  await assert.rejects(() => store.updateGuest(ada.id, { table_id: 'missing-table', seat_index: 0 }), /table/i);
  await assert.rejects(() => store.updateGuest(ada.id, { table_id: t.id, seat_index: 2 }), /seat/i);
  await assert.rejects(() => store.updateGuest(ada.id, { table_id: t.id, seat_index: -1 }), /seat/i);
  await assert.rejects(() => store.updateGuest(ada.id, { table_id: t.id, seat_index: null }), /seat/i);
  await assert.rejects(() => store.updateGuest('missing-guest', { table_id: t.id, seat_index: 0 }), /not found/i);

  // a table from a DIFFERENT event is rejected too
  const other = await store.createEvent({ name: 'Other' });
  const foreign = await store.createTable(other.id, { seats: 4 });
  await assert.rejects(() => store.updateGuest(ada.id, { table_id: foreign.id, seat_index: 0 }), /table/i);
});

test('guests: createGuest and deleteGuest round-trip', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Manual' });
  const g = await store.createGuest(ev.id, { name: ' Cleo ', email: 'c@x.com', party: 'Jones' });
  assert.equal(g.name, 'Cleo');
  assert.equal(g.party, 'Jones');
  assert.equal(g.table_id, null);
  await assert.rejects(() => store.createGuest(ev.id, { name: '  ' }), /name/i);
  const res = await store.deleteGuest(g.id);
  assert.deepEqual(res, { ok: true });
  const full = await store.getEvent(ev.id);
  assert.equal(full.guests.length, 0);
});

// ---------- persistence ----------

test('persistence: data survives store re-instantiation over the same backing storage', async () => {
  const storage = memStorage();
  const store1 = createStore(storage);
  const ev = await store1.createEvent({ name: 'Persist', venue: 'Barn' });
  const t = await store1.createTable(ev.id, { seats: 6, label: 'Garden' });
  await store1.importGuestsCsv(ev.id, 'name\nAda\n');
  const g = (await store1.getEvent(ev.id)).guests[0];
  await store1.updateGuest(g.id, { table_id: t.id, seat_index: 3 });

  // simulate a page reload: new store instance, same localStorage
  const store2 = createStore(storage);
  const full = await store2.getEvent(ev.id);
  assert.equal(full.name, 'Persist');
  assert.equal(full.tables[0].label, 'Garden');
  assert.equal(full.guests[0].name, 'Ada');
  assert.equal(full.guests[0].table_id, t.id);
  assert.equal(full.guests[0].seat_index, 3);
});

test('persistence: one namespaced key carrying schemaVersion', async () => {
  const storage = memStorage();
  const store = createStore(storage);
  await store.createEvent({ name: 'Key check' });
  assert.deepEqual([...storage._map.keys()], [STORAGE_KEY], 'exactly one namespaced key');
  const raw = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(raw.schemaVersion, SCHEMA_VERSION);
});

test('persistence: corrupt or wrong-version payloads reset to empty instead of crashing', async () => {
  const storage = memStorage();
  storage.setItem(STORAGE_KEY, 'not json {{{');
  const store = createStore(storage);
  assert.deepEqual(await store.listEvents(), []);

  storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 999, events: [{ id: 'x' }] }));
  const store2 = createStore(storage);
  assert.deepEqual(await store2.listEvents(), [], 'unknown schemaVersion treated as empty');
});

test('persistence: works with no storage injected (internal memory fallback)', async () => {
  const store = createStore(undefined);
  const ev = await store.createEvent({ name: 'Memory only' });
  const list = await store.listEvents();
  assert.equal(list[0].id, ev.id);
});

test('mutating a returned object does not corrupt the store', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Immutable' });
  const t = await store.createTable(ev.id, { seats: 6 });
  t.seats = 999;
  t.label = 'hacked';
  const full = await store.getEvent(ev.id);
  assert.equal(full.tables[0].seats, 6);
  assert.notEqual(full.tables[0].label, 'hacked');
});

// ---------- CSV import ----------

test('csv import: happy path with all columns', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'CSV' });
  const res = await store.importGuestsCsv(ev.id, 'name,email,notes,party\nAda Lovelace,ada@x.com,vegetarian,Byron\nBob,,,\n');
  assert.equal(res.imported, 2);
  assert.equal(res.guests.length, 2);
  const full = await store.getEvent(ev.id);
  const ada = full.guests.find((g) => g.name === 'Ada Lovelace');
  assert.equal(ada.email, 'ada@x.com');
  assert.equal(ada.notes, 'vegetarian');
  assert.equal(ada.party, 'Byron');
  const bob = full.guests.find((g) => g.name === 'Bob');
  assert.equal(bob.email, null);
  assert.equal(bob.party, null);
});

test('csv import: header aliases (Guest Name / E-mail / Dietary / Group), case-insensitive', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Aliases' });
  const csv = 'Guest Name,E-mail,Dietary,Group\r\nZoe Q,zoe@x.com,nut allergy,Quinn\r\n';
  const res = await store.importGuestsCsv(ev.id, csv);
  assert.equal(res.imported, 1);
  const g = (await store.getEvent(ev.id)).guests[0];
  assert.equal(g.name, 'Zoe Q');
  assert.equal(g.email, 'zoe@x.com');
  assert.equal(g.notes, 'nut allergy');
  assert.equal(g.party, 'Quinn');
});

test('csv import: quoted fields — commas, escaped quotes, newlines in quotes, BOM, blank rows skipped', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Quoting' });
  const csv = '\uFEFFname,notes\n"Smith, Jr., Bob","said ""hi""\non two lines"\n\n"  "\nPlain Jane,fine\n';
  const res = await store.importGuestsCsv(ev.id, csv);
  assert.equal(res.imported, 2, 'blank-name rows skipped');
  const guests = (await store.getEvent(ev.id)).guests;
  const bob = guests.find((g) => g.name === 'Smith, Jr., Bob');
  assert.ok(bob, 'comma-laden quoted name preserved');
  assert.equal(bob.notes, 'said "hi"\non two lines');
});

test('csv import: errors — missing name column, empty file, no data rows, unknown event', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Errors' });
  await assert.rejects(() => store.importGuestsCsv(ev.id, 'email,notes\na@x.com,hi\n'), /"name" column/);
  await assert.rejects(() => store.importGuestsCsv(ev.id, '   '), /empty/i);
  await assert.rejects(() => store.importGuestsCsv(ev.id, 'name\n\n'), /No guest rows/i);
  await assert.rejects(() => store.importGuestsCsv('missing-event', 'name\nAda\n'), /not found/i);
});

// ---------- CSV export ----------

test('csv export: columns, 1-based seat numbers, seated-then-unassigned ordering, quoting', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Export Test' });
  const tb = await store.createTable(ev.id, { label: 'B Table', seats: 4 });
  const ta = await store.createTable(ev.id, { label: 'A Table', seats: 4 });
  await store.importGuestsCsv(ev.id, 'name,email,party,notes\nWanda,,Solo,\nAda,ada@x.com,Byron,"loves ""cake"", tea"\nBob,,,\n');
  const guests = (await store.getEvent(ev.id)).guests;
  const ada = guests.find((g) => g.name === 'Ada');
  const bob = guests.find((g) => g.name === 'Bob');
  await store.updateGuest(ada.id, { table_id: tb.id, seat_index: 1 });
  await store.updateGuest(bob.id, { table_id: ta.id, seat_index: 0 });

  const csv = await store.exportCsv(ev.id);
  const lines = csv.split('\r\n');
  assert.equal(lines[0], 'Guest,Email,Party,Table,Seat,Notes');
  // seated rows first ordered by table label; unassigned last
  assert.equal(lines[1], 'Bob,,,A Table,1,');
  assert.equal(lines[2], 'Ada,ada@x.com,Byron,B Table,2,"loves ""cake"", tea"');
  assert.equal(lines[3], 'Wanda,,Solo,Unassigned,,');
  assert.equal(lines[4], '', 'trailing CRLF');
});

test('csv export: round-trips through the importer', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: 'Round Trip' });
  await store.importGuestsCsv(ev.id, 'name,email,party,notes\n"Lee, Ann",ann@x.com,Lee,"gluten-free, please"\n');
  const exported = await store.exportCsv(ev.id);

  // Re-import the export into a fresh event: Guest→name, Email→email, Party→party, Notes→notes
  const ev2 = await store.createEvent({ name: 'Round Trip 2' });
  const res = await store.importGuestsCsv(ev2.id, exported);
  assert.equal(res.imported, 1);
  const g = (await store.getEvent(ev2.id)).guests[0];
  assert.equal(g.name, 'Lee, Ann');
  assert.equal(g.email, 'ann@x.com');
  assert.equal(g.party, 'Lee');
  assert.equal(g.notes, 'gluten-free, please');
});

test('csv export: filename matches the server Content-Disposition slug', async () => {
  const { store } = freshStore();
  const ev = await store.createEvent({ name: "Emma & James's Wedding!" });
  assert.equal(await store.exportFilename(ev.id), 'emma-james-s-wedding-seating.csv');
  const blank = await store.createEvent({ name: '???' });
  assert.equal(await store.exportFilename(blank.id), 'seating-seating.csv');
  await assert.rejects(() => store.exportFilename('missing'), /not found/i);
});

// ---------- low-level csv helpers ----------

test('parseCsv / guestsFromCsv / toCsv helpers behave like src/csv.js', () => {
  assert.deepEqual(parseCsv('a,b\r\nc,"d,e"\r\n'), [['a', 'b'], ['c', 'd,e']]);
  assert.deepEqual(parseCsv(''), []);
  assert.equal(guestsFromCsv('').error, 'The file is empty.');
  assert.equal(guestsFromCsv('foo,bar\n1,2\n').error, 'CSV must have a "name" column.');
  assert.equal(toCsv(['a'], [['x,y'], ['"q"']]), 'a\r\n"x,y"\r\n"""q"""\r\n');
});
