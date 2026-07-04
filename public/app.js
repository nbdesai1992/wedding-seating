'use strict';

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

async function api(method, url, body, isForm) {
  const opts = { method, headers: {} };
  if (isForm) opts.body = body;
  else if (body !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.message || j.error || msg; } catch (_) {}
    throw new Error(msg);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : res.text();
}

let toastTimer;
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 2400);
}
function savedBlip() {
  const s = $('#saved');
  s.innerHTML = '<i>✓</i> Saved just now';
  clearTimeout(savedBlip.t);
  savedBlip.t = setTimeout(() => { s.innerHTML = '<i>✓</i> Saved'; }, 4000);
}

const firstName = (n) => (n || '').trim().split(/\s+/)[0] || n;
const initials = (n) => (n || '').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
// DATE columns arrive as UTC midnight — format in UTC or the local day is off by one
const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }) : null;

// ---------- state ----------
let current = null;           // current event {id,name,tables,guests,...}
let zoom = 1;
let filterMode = 'toplace';   // toplace | seated | all
let searchTerm = '';

// ---------- routing ----------
function showHome() { $('#home').classList.remove('hidden'); $('#event').classList.add('hidden'); }
function showEvent() { $('#home').classList.add('hidden'); $('#event').classList.remove('hidden'); }
async function route() {
  const m = location.hash.match(/^#\/event\/(.+)$/);
  if (m) await openEvent(m[1]);
  else { current = null; showHome(); await loadEvents(); }
}
window.addEventListener('hashchange', route);

// ---------- home ----------
function newEventCard() {
  const card = el('div', 'card new');
  card.appendChild(el('div', 'plus', '+'));
  card.appendChild(el('h3', 'serif', 'New celebration'));
  card.appendChild(el('p', null, 'Name the day, and we’ll set the room together.'));
  card.addEventListener('click', () => card.replaceWith(newEventForm()));
  return card;
}
function newEventForm() {
  const card = el('div', 'card form');
  card.appendChild(el('h3', 'serif', 'Start a new celebration'));
  const mk = (label, id, type, ph) => {
    const f = el('div', 'field');
    const l = el('label', null, label); l.setAttribute('for', id);
    const i = el('input'); i.id = id; i.type = type || 'text'; if (ph) i.placeholder = ph;
    f.append(l, i); return f;
  };
  card.appendChild(mk('Celebration name', 'ev-name', 'text', 'Emma & James’s Wedding'));
  card.appendChild(mk('Date', 'ev-date', 'date'));
  card.appendChild(mk('Venue', 'ev-venue', 'text', 'The Old Barn'));
  const row = el('div', null); row.style.cssText = 'display:flex;gap:9px;margin-top:4px';
  const go = el('button', 'btn primary', 'Create celebration');
  const cancel = el('button', 'btn', 'Cancel');
  go.addEventListener('click', async () => {
    const name = $('#ev-name', card).value.trim();
    if (!name) { toast('Give it a name first', true); return; }
    try {
      const ev = await api('POST', '/api/events', {
        name, event_date: $('#ev-date', card).value || null, venue: $('#ev-venue', card).value.trim() || null,
      });
      toast('Celebration created');
      location.hash = `#/event/${ev.id}`;
    } catch (e) { toast(e.message, true); }
  });
  cancel.addEventListener('click', () => card.replaceWith(newEventCard()));
  row.append(go, cancel);
  card.appendChild(row);
  setTimeout(() => $('#ev-name', card).focus(), 50);
  return card;
}

async function loadEvents() {
  const grid = $('#events-grid');
  grid.innerHTML = '';
  grid.appendChild(newEventCard());
  let events = [];
  try { events = await api('GET', '/api/events'); }
  catch (e) { grid.appendChild(el('div', 'empty-note', 'Could not load celebrations.')); return; }
  for (const ev of events) {
    const seated = parseInt(ev.seated_count ?? 0, 10);
    const total = parseInt(ev.guest_count, 10);
    const card = el('div', 'card');
    card.style.cursor = 'pointer';
    card.appendChild(el('h3', 'serif', ev.name));
    card.appendChild(el('div', 'meta', [fmtDate(ev.event_date), ev.venue].filter(Boolean).join(' · ') || 'No date set'));
    const prog = el('div', 'progress');
    const bar = el('div', 'bar'); const fill = el('i');
    fill.style.width = total ? Math.round(100 * seated / total) + '%' : '0%';
    bar.appendChild(fill); prog.appendChild(bar);
    const pl = el('div', 'plabel');
    const left = el('span'); left.innerHTML = total ? `<b>${seated} of ${total}</b> guests seated` : 'No guests yet';
    pl.append(left, el('span', null, `${ev.table_count} tables`));
    prog.appendChild(pl);
    card.appendChild(prog);
    const chips = el('div', 'chips');
    if (!total) chips.appendChild(el('span', 'chip rose', 'Just started'));
    else if (seated >= total) chips.appendChild(el('span', 'chip', 'All seated 🎉'));
    else if (seated / total > 0.7) { chips.appendChild(el('span', 'chip', 'Nearly there')); chips.appendChild(el('span', 'chip rose', `${total - seated} to place`)); }
    else chips.appendChild(el('span', 'chip rose', `${total - seated} to place`));
    card.appendChild(chips);
    card.addEventListener('click', () => { location.hash = `#/event/${ev.id}`; });
    grid.appendChild(card);
  }
}

// ---------- event ----------
async function openEvent(id) {
  try { current = await api('GET', `/api/events/${id}`); }
  catch (e) { toast('Celebration not found', true); location.hash = ''; return; }
  showEvent();
  $('#event-title').textContent = current.name;
  $('#event-meta').textContent = [fmtDate(current.event_date), current.venue].filter(Boolean).join(' · ') || 'date to be set';
  $('#export-btn').setAttribute('href', `/api/events/${current.id}/export.csv`);
  const cw = $('#canvas').getBoundingClientRect().width;
  zoom = cw < 700 ? Math.max(0.42, cw / 840) : 1;   // fit-to-room on small viewports
  applyZoom();
  renderAll();
}
$('#back-btn').addEventListener('click', () => { location.hash = ''; });

function renderAll() { renderCanvas(); renderGuests(); renderLegend(); }

// ---------- table geometry (sizes express capacity, per approved design) ----------
function tableSize(t) {
  let dims;
  if (t.kind === 'sweetheart') dims = { w: 90, h: 90 };
  else if (t.kind === 'head') dims = { w: Math.max(240, 130 + t.seats * 21), h: 62 };
  else if (t.shape === 'long') dims = { w: Math.max(150, 76 + Math.ceil(t.seats / 2) * 30), h: 58 };
  else { const d = Math.max(84, Math.min(170, 54 + t.seats * 8)); dims = { w: d, h: d }; }
  if (t.orientation === 'vertical' && (t.shape === 'long' || t.kind === 'head')) {
    dims = { w: dims.h, h: dims.w };
  }
  return dims;
}
const isRotatable = (t) => t.shape === 'long' || t.kind === 'head';
function seatPositions(t, w, h) {
  // vertical rectangles: compute seat layout on the horizontal footprint, then
  // rotate each point 90° — seat indices stay stable so assignments survive rotation
  if (t.orientation === 'vertical' && isRotatable(t)) {
    return seatPositionsH(t, h, w).map((p) => ({ x: -p.y, y: p.x }));
  }
  return seatPositionsH(t, w, h);
}
function seatPositionsH(t, w, h) {
  const pts = [];
  if (t.kind === 'head') {
    // all seats along the bottom edge, facing the room
    for (let i = 0; i < t.seats; i++) {
      const x = t.seats === 1 ? 0.5 : i / (t.seats - 1);
      pts.push({ x: w * (0.08 + 0.84 * x) - w / 2, y: h / 2 + 15 });
    }
    return pts;
  }
  if (t.shape === 'long') {
    const top = Math.ceil(t.seats / 2), bot = t.seats - top;
    const place = (count, y) => {
      for (let i = 0; i < count; i++) {
        const x = count === 1 ? 0.5 : i / (count - 1);
        pts.push({ x: w * (0.12 + 0.76 * x) - w / 2, y });
      }
    };
    place(top, -(h / 2 + 15)); place(bot, h / 2 + 15);
    return pts;
  }
  const R = w / 2 + 15;
  for (let i = 0; i < t.seats; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / t.seats;
    pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
  }
  return pts;
}
const guestAt = (tableId, seatIndex) => current.guests.find((g) => g.table_id === tableId && g.seat_index === seatIndex);

function renderCanvas() {
  const layer = $('#layer');
  layer.innerHTML = '';
  $('#empty-overlay').classList.toggle('hidden', current.tables.length > 0);

  for (const fx of (current.fixtures || [])) {
    const node = el('div', 'fixture-node');
    node.style.left = fx.x + 'px';
    node.style.top = fx.y + 'px';
    const shape = el('div', 'fshape' + (fx.shape === 'round' ? ' round' : '') + (fx.h > fx.w * 1.4 ? ' portrait' : ''));
    shape.style.width = fx.w + 'px'; shape.style.height = fx.h + 'px';
    shape.style.marginLeft = (-fx.w / 2) + 'px'; shape.style.marginTop = (-fx.h / 2) + 'px';
    shape.appendChild(el('span', 'flabel', fx.label));
    node.appendChild(shape);
    const tools = el('div', 'ttools');
    const mk2 = (txt, title, fn) => { const b = el('button', null, txt); b.title = title; b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };
    tools.append(mk2('✎', 'Rename', () => renameFixture(fx)));
    if (fx.shape !== 'round') tools.append(mk2('⟳', 'Rotate', () => rotateFixture(fx)));
    tools.append(mk2('🗑', 'Remove', () => deleteFixture(fx)));
    node.appendChild(tools);
    shape.addEventListener('pointerdown', (e) => startFixtureDrag(e, node, fx));
    layer.appendChild(node);
  }

  for (const table of current.tables) {
    const { w, h } = tableSize(table);
    const pts = seatPositions(table, w, h);
    const filled = current.guests.filter((g) => g.table_id === table.id).length;

    const node = el('div', 'table-node');
    node.style.left = table.x + 'px';
    node.style.top = table.y + 'px';
    if (filled >= table.seats) node.classList.add('full');

    const shapeCls = table.kind === 'head' ? 'long head' : (table.kind === 'sweetheart' ? 'round' : table.shape);
    const shape = el('div', `tshape ${shapeCls}`);
    shape.style.width = w + 'px'; shape.style.height = h + 'px';
    shape.style.marginLeft = (-w / 2) + 'px'; shape.style.marginTop = (-h / 2) + 'px';
    const displayLabel = (t) => (t.orientation === 'vertical' && isRotatable(t))
      ? t.label.replace(/\s+\u2014\s+/g, ' ') : t.label;
    shape.appendChild(el('div', 'tname', displayLabel(table)));
    shape.appendChild(el('div', 'tcount', `${filled}/${table.seats}`));
    node.appendChild(shape);

    pts.forEach((p, i) => {
      const seat = el('div', 'seat');
      seat.style.left = p.x + 'px'; seat.style.top = p.y + 'px';
      seat.dataset.seat = i; seat.dataset.tableId = table.id;
      const g = guestAt(table.id, i);
      if (g) {
        seat.classList.add('f');
        seat.textContent = initials(g.name);
        seat.title = g.name;
        seat.addEventListener('pointerdown', (e) => startGuestDrag(e, g.id));
      }
      node.appendChild(seat);
    });

    const tools = el('div', 'ttools');
    const mk = (txt, title, fn, cls) => { const b = el('button', cls, txt); b.title = title; b.addEventListener('pointerdown', (e) => e.stopPropagation()); b.addEventListener('click', (e) => { e.stopPropagation(); fn(); }); return b; };
    tools.append(mk('✎', 'Rename', () => renameTable(table)));
    if (isRotatable(table)) tools.append(mk('⟳', 'Rotate', () => rotateTable(table)));
    tools.append(
      mk('−', 'Fewer seats', () => changeSeats(table, -1)),
      mk('+', 'More seats', () => changeSeats(table, +1)),
      mk('🗑', 'Remove table', () => deleteTable(table))
    );
    node.appendChild(tools);

    shape.addEventListener('pointerdown', (e) => startTableDrag(e, node, table));
    layer.appendChild(node);
  }
}

function renderLegend() {
  const seated = current.guests.filter((g) => g.table_id).length;
  $('#legend').innerHTML = `<span><b>${current.tables.length}</b> tables</span><span><b>${seated}</b> seated</span><span>drag a table to move it</span>`;
}

// ---------- zoom ----------
function applyZoom() { $('#layer').style.transform = `scale(${zoom})`; }
$('#zoom-in').addEventListener('click', () => { zoom = Math.min(1.6, zoom + 0.15); applyZoom(); });
$('#zoom-out').addEventListener('click', () => { zoom = Math.max(0.5, zoom - 0.15); applyZoom(); });
$('#zoom-fit').addEventListener('click', () => { zoom = 1; applyZoom(); });

// ---------- guests panel ----------
function setFilter(mode) {
  filterMode = mode;
  for (const p of document.querySelectorAll('.pill')) p.classList.toggle('on', p.dataset.f === mode);
  renderGuests();
}
document.querySelectorAll('.pill').forEach((p) => p.addEventListener('click', () => setFilter(p.dataset.f)));
$('#gsearch').addEventListener('input', (e) => { searchTerm = e.target.value.trim().toLowerCase(); renderGuests(); });

function renderGuests() {
  const list = $('#guest-list');
  list.innerHTML = '';
  const total = current.guests.length;
  const seated = current.guests.filter((g) => g.table_id).length;
  const unassigned = total - seated;

  $('#gp-progress').classList.toggle('hidden', total === 0);
  if (total) {
    $('#pbar-fill').style.width = Math.round(100 * seated / total) + '%';
    $('#plabel-left').innerHTML = `<b>${seated} of ${total}</b> seated`;
    $('#plabel-right').textContent = `${unassigned} to place`;
  }
  const capacity = current.tables.reduce((n, t) => n + t.seats, 0);
  const openSeats = Math.max(0, capacity - seated);
  const cap = $('#cap-note');
  if (total && unassigned > openSeats) {
    cap.textContent = `${openSeats} seats open — add tables for ${unassigned - openSeats} more`;
    cap.classList.remove('hidden');
  } else cap.classList.add('hidden');
  $('#pill-toplace').textContent = `To place${total ? ' · ' + unassigned : ''}`;
  $('#pill-seated').textContent = `Seated${total ? ' · ' + seated : ''}`;
  $('#pill-all').textContent = 'All';

  $('#gp-dropnote').classList.toggle('hidden', seated === 0);
  if (total === 0) {
    const imp = el('div', 'gimport');
    imp.appendChild(el('div', 'ic', '✉'));
    imp.appendChild(el('p', null, 'Bring your list in one step — we’ll read names, emails and parties from a CSV.'));
    const b = el('button', 'btn', 'Import guest list (CSV)');
    b.addEventListener('click', () => $('#import-file').click());
    imp.appendChild(b);
    list.appendChild(imp);
    return;
  }

  let pool = current.guests;
  if (filterMode === 'toplace') pool = pool.filter((g) => !g.table_id);
  if (filterMode === 'seated') pool = pool.filter((g) => g.table_id);
  if (searchTerm) pool = pool.filter((g) => g.name.toLowerCase().includes(searchTerm) || (g.party || '').toLowerCase().includes(searchTerm));

  // group unplaced guests into parties (2+ members shown as a party card)
  const tablesById = new Map(current.tables.map((t) => [t.id, t]));
  const parties = new Map();
  const singles = [];
  for (const g of pool) {
    if (!g.table_id && g.party) {
      if (!parties.has(g.party)) parties.set(g.party, []);
      parties.get(g.party).push(g);
    } else singles.push(g);
  }
  for (const [name, members] of parties) {
    if (members.length < 2) { singles.push(...members); continue; }
    const card = el('div', 'party');
    const ph = el('div', 'ph');
    ph.appendChild(el('span', 'pn', `${name} party`));
    ph.appendChild(el('span', 'pc', `${members.length} guests`));
    const btn = el('span', 'seatp', 'Seat together →');
    btn.addEventListener('click', () => seatParty(name, members));
    ph.appendChild(btn);
    card.appendChild(ph);
    card.appendChild(el('div', 'names', members.map((m) => firstName(m.name)).join(', ')));
    list.appendChild(card);
  }
  for (const g of singles) {
    const chip = el('div', 'g');
    chip.appendChild(el('span', 'dot'));
    chip.appendChild(el('span', null, g.name));
    if (g.table_id) {
      const t = tablesById.get(g.table_id);
      chip.appendChild(el('span', 'where', t ? t.label : ''));
    }
    chip.addEventListener('pointerdown', (e) => startGuestDrag(e, g.id));
    list.appendChild(chip);
  }
  if (!list.children.length) list.appendChild(el('div', 'empty-note', filterMode === 'toplace' ? 'Everyone has a seat 🎉' : 'No matches.'));
}

async function seatParty(name, members) {
  // find a table with enough free seats (prefer non-head standard tables)
  const free = (t) => {
    const taken = new Set(current.guests.filter((g) => g.table_id === t.id).map((g) => g.seat_index));
    return Array.from({ length: t.seats }, (_, i) => i).filter((i) => !taken.has(i));
  };
  const candidates = [...current.tables].sort((a, b) =>
    (a.kind === 'standard' ? 0 : 1) - (b.kind === 'standard' ? 0 : 1) || free(b).length - free(a).length);
  const target = candidates.find((t) => free(t).length >= members.length);
  if (!target) { toast(`No table has ${members.length} free seats — add one first`, true); return; }
  try {
    const seats = free(target);
    for (let i = 0; i < members.length; i++) {
      await api('PATCH', `/api/guests/${members[i].id}`, { table_id: target.id, seat_index: seats[i] });
    }
    await refresh();
    savedBlip();
    toast(`${name} party seated at ${target.label}`);
  } catch (e) { toast(e.message, true); await refresh(); }
}

// ---------- drag: tables ----------
function startTableDrag(e, node, table) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  const rect = $('#canvas').getBoundingClientRect();
  const startX = e.clientX, startY = e.clientY;
  const origX = table.x, origY = table.y;
  let moved = false;
  node.classList.add('dragging');
  function move(ev) {
    const dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    table.x = Math.max(50, Math.min(rect.width / zoom - 50, origX + dx));
    table.y = Math.max(50, Math.min(rect.height / zoom - 84, origY + dy));
    node.style.left = table.x + 'px'; node.style.top = table.y + 'px';
  }
  async function up() {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    node.classList.remove('dragging');
    if (moved) {
      try { await api('PATCH', `/api/tables/${table.id}`, { x: table.x, y: table.y }); savedBlip(); }
      catch (err) { toast('Could not save position', true); }
    }
  }
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

// ---------- drag: guests ----------
function startGuestDrag(e, guestId) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const guest = current.guests.find((g) => g.id === guestId);
  if (!guest) return;
  const ghost = el('div', 'drag-ghost', firstName(guest.name));
  ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
  document.body.appendChild(ghost);
  let hoverSeat = null;
  const panel = $('#guests-panel');
  const under = (ev) => { ghost.style.display = 'none'; const u = document.elementFromPoint(ev.clientX, ev.clientY); ghost.style.display = ''; return u; };
  function move(ev) {
    ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
    const u = under(ev);
    const seat = u && u.closest ? u.closest('.seat') : null;
    if (hoverSeat && hoverSeat !== seat) hoverSeat.classList.remove('seat-hover');
    hoverSeat = seat && seat.dataset.tableId ? seat : null;
    if (hoverSeat) hoverSeat.classList.add('seat-hover');
    panel.classList.toggle('drop-active', !!(u && u.closest && u.closest('#guests-panel')) && !seat);
  }
  async function up(ev) {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    ghost.remove();
    panel.classList.remove('drop-active');
    if (hoverSeat) hoverSeat.classList.remove('seat-hover');
    const u = under(ev);
    const seat = u && u.closest ? u.closest('.seat') : null;
    const overPanel = u && u.closest && u.closest('#guests-panel');
    try {
      if (seat && seat.dataset.tableId) {
        await api('PATCH', `/api/guests/${guestId}`, { table_id: seat.dataset.tableId, seat_index: parseInt(seat.dataset.seat, 10) });
        await refresh(); savedBlip();
        toast(`${firstName(guest.name)} seated`);
      } else if (overPanel && guest.table_id) {
        await api('PATCH', `/api/guests/${guestId}`, { table_id: null, seat_index: null });
        await refresh(); savedBlip();
        toast(`${firstName(guest.name)} unseated`);
      }
    } catch (err) { toast(err.message || 'Could not move guest', true); await refresh(); }
  }
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

async function refresh() {
  const fresh = await api('GET', `/api/events/${current.id}`);
  current.tables = fresh.tables; current.guests = fresh.guests; current.fixtures = fresh.fixtures;
  renderAll();
}

// ---------- table ops ----------
const KIND_MAP = {
  round: { shape: 'round', kind: 'standard' },
  banquet: { shape: 'long', kind: 'standard' },
  head: { shape: 'long', kind: 'head' },
  sweetheart: { shape: 'round', kind: 'sweetheart' },
};
function toggleAddMenu(show) { $('#add-menu').classList.toggle('hidden', show === undefined ? undefined : !show); }
$('#add-table-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleAddMenu(); });
document.addEventListener('click', (e) => { if (!e.target.closest('.addmenu')) toggleAddMenu(false); });
$('#first-table-btn').addEventListener('click', () => addTable('round', 8));
$('#add-confirm').addEventListener('click', () => {
  const type = $('#table-kind').value;
  const seats = parseInt($('#table-seats').value, 10) || 8;
  toggleAddMenu(false);
  addTable(type, seats);
});
$('#fixture-type').addEventListener('change', () => {
  $('#fixture-name-wrap').classList.toggle('hidden', $('#fixture-type').value !== 'custom');
});
$('#add-fixture-confirm').addEventListener('click', () => {
  const ftype = $('#fixture-type').value;
  const label = ftype === 'custom' ? ($('#fixture-name').value || '').trim() : undefined;
  toggleAddMenu(false);
  $('#fixture-name').value = '';
  addFixture(ftype, label);
});

async function addTable(type, seats, x, y, label) {
  const m = KIND_MAP[type] || KIND_MAP.round;
  const n = current.tables.length;
  try {
    const t = await api('POST', `/api/events/${current.id}/tables`, {
      shape: m.shape, kind: m.kind, seats: m.kind === 'sweetheart' ? 2 : seats, label,
      x: x ?? 150 + (n % 4) * 190, y: y ?? 150 + Math.floor(n / 4) * 200,
    });
    current.tables.push(t);
    renderAll(); savedBlip();
  } catch (e) { toast(e.message, true); }
}

// room templates (first-run starters)
const TEMPLATES = {
  classic: [
    ['head', 8, 480, 70, 'Head Table'],
    ['round', 8, 160, 210], ['round', 8, 400, 240], ['round', 8, 650, 240], ['round', 8, 860, 210],
    ['round', 8, 160, 430], ['round', 8, 400, 470], ['round', 8, 650, 470], ['round', 8, 860, 430],
  ],
  banquet: [
    ['head', 8, 480, 70, 'Head Table'],
    ['banquet', 10, 250, 230], ['banquet', 10, 250, 360], ['banquet', 10, 250, 490],
    ['banquet', 10, 690, 230], ['banquet', 10, 690, 360], ['banquet', 10, 690, 490],
  ],
  mixed: [
    ['head', 8, 480, 70, 'Head Table'],
    ['round', 12, 150, 210], ['round', 10, 150, 430],
    ['round', 8, 340, 290], ['round', 8, 340, 490], ['round', 8, 540, 470],
    ['sweetheart', 2, 690, 400, 'Sweetheart'],
    ['banquet', 8, 810, 190], ['banquet', 8, 810, 320], ['round', 10, 830, 480],
  ],
};
const TEMPLATE_FIXTURES = {
  classic: [['dance', 480, 300]],
  banquet: [['dance', 480, 330]],
  mixed: [['dance', 500, 250], ['dj', 500, 105]],
};
document.querySelectorAll('.tpl').forEach((b) => b.addEventListener('click', async () => {
  const rows = TEMPLATES[b.dataset.tpl];
  if (!rows) return;
  toast('Setting the room…');
  // templates are authored on a 960x600 room — scale to this canvas so nothing clips
  const rect = $('#canvas').getBoundingClientRect();
  const sx = rect.width / 960, sy = rect.height / 600;
  for (const [type, seats, x, y, label] of rows) {
    await addTable(type, seats, Math.round(x * sx), Math.round(y * sy), label);
  }
  for (const [ftype, x, y] of (TEMPLATE_FIXTURES[b.dataset.tpl] || [])) {
    await addFixture(ftype, undefined, Math.round(x * sx), Math.round(y * sy));
  }
  await refresh();
  toast('Room ready — drag anything to fit your venue');
}));

async function renameTable(table) {
  const name = prompt('Table name', table.label);
  if (name == null) return;
  try { Object.assign(table, await api('PATCH', `/api/tables/${table.id}`, { label: name.trim() || table.label })); renderAll(); savedBlip(); }
  catch (e) { toast(e.message, true); }
}
async function changeSeats(table, delta) {
  const seats = Math.max(1, Math.min(20, table.seats + delta));
  if (seats === table.seats) return;
  try { Object.assign(table, await api('PATCH', `/api/tables/${table.id}`, { seats })); await refresh(); savedBlip(); }
  catch (e) { toast(e.message, true); }
}
async function deleteTable(table) {
  if (!confirm(`Remove “${table.label}”? Guests there will be unseated.`)) return;
  try { await api('DELETE', `/api/tables/${table.id}`); await refresh(); savedBlip(); toast('Table removed'); }
  catch (e) { toast(e.message, true); }
}

// ---------- rotation + fixtures ----------
async function rotateTable(table) {
  const orientation = table.orientation === 'vertical' ? 'horizontal' : 'vertical';
  try {
    Object.assign(table, await api('PATCH', `/api/tables/${table.id}`, { orientation }));
    renderAll(); savedBlip();
  } catch (e) { toast(e.message, true); }
}

function startFixtureDrag(e, node, fx) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  const rect = $('#canvas').getBoundingClientRect();
  const startX = e.clientX, startY = e.clientY;
  const origX = fx.x, origY = fx.y;
  let moved = false;
  node.classList.add('dragging');
  function move(ev) {
    const dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    fx.x = Math.max(40, Math.min(rect.width / zoom - 40, origX + dx));
    fx.y = Math.max(40, Math.min(rect.height / zoom - 84, origY + dy));
    node.style.left = fx.x + 'px'; node.style.top = fx.y + 'px';
  }
  async function up() {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    node.classList.remove('dragging');
    if (moved) {
      try { await api('PATCH', `/api/fixtures/${fx.id}`, { x: fx.x, y: fx.y }); savedBlip(); }
      catch (err) { toast('Could not save position', true); }
    }
  }
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

async function addFixture(ftype, label, x, y) {
  const n = (current.fixtures || []).length;
  try {
    const fx = await api('POST', `/api/events/${current.id}/fixtures`, {
      ftype, label, x: x ?? 260 + (n % 3) * 200, y: y ?? 220 + Math.floor(n / 3) * 160,
    });
    current.fixtures = current.fixtures || [];
    current.fixtures.push(fx);
    renderAll(); savedBlip();
    toast(`${fx.label} added`);
  } catch (e) { toast(e.message, true); }
}

async function renameFixture(fx) {
  const name = prompt('Name this room item', fx.label);
  if (name == null) return;
  try {
    Object.assign(fx, await api('PATCH', `/api/fixtures/${fx.id}`, { label: name.trim() || fx.label }));
    renderAll(); savedBlip();
  } catch (e) { toast(e.message, true); }
}

async function rotateFixture(fx) {
  try {
    Object.assign(fx, await api('PATCH', `/api/fixtures/${fx.id}`, { w: fx.h, h: fx.w }));
    renderAll(); savedBlip();
  } catch (e) { toast(e.message, true); }
}

async function deleteFixture(fx) {
  if (!confirm(`Remove “${fx.label}” from the room?`)) return;
  try {
    await api('DELETE', `/api/fixtures/${fx.id}`);
    current.fixtures = (current.fixtures || []).filter((f) => f.id !== fx.id);
    renderAll(); savedBlip();
    toast('Removed');
  } catch (e) { toast(e.message, true); }
}

// ---------- import ----------
$('#import-btn').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  try {
    const result = await api('POST', `/api/events/${current.id}/guests/import`, fd, true);
    await refresh(); savedBlip();
    toast(`Imported ${result.imported} guests`);
  } catch (err) { toast(err.message, true); }
  e.target.value = '';
});

// ---------- session (quiet whoami in the header) ----------
async function loadWhoami() {
  try {
    const me = await api('GET', '/api/me');
    const box = $('#whoami');
    box.textContent = '';
    box.append(`signed in as ${me.email} · `);
    const out = el('a', null, 'sign out');
    out.addEventListener('click', async () => {
      try { await fetch('/logout', { method: 'POST' }); } catch (_) {}
      location.href = '/login';
    });
    box.append(out);
  } catch (_) { /* not signed in (test/bypass edge) — leave header quiet */ }
}
loadWhoami();

// ---------- go ----------
route();
