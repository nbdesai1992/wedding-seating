'use strict';

// ---------- tiny helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

async function api(method, url, body, isForm) {
  const opts = { method, headers: {} };
  if (isForm) { opts.body = body; }
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

const firstName = (n) => (n || '').trim().split(/\s+/)[0] || n;
const initials = (n) => (n || '').trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

// ---------- routing ----------
let current = null; // current event {id, name, tables, guests}

function showHome() { $('#home').classList.remove('hidden'); $('#event').classList.add('hidden'); }
function showEvent() { $('#home').classList.add('hidden'); $('#event').classList.remove('hidden'); }

async function route() {
  const m = location.hash.match(/^#\/event\/(.+)$/);
  if (m) { await openEvent(m[1]); }
  else { current = null; showHome(); await loadEvents(); }
}
window.addEventListener('hashchange', route);

// ---------- home ----------
async function loadEvents() {
  const grid = $('#events-grid');
  grid.innerHTML = '';
  let events = [];
  try { events = await api('GET', '/api/events'); }
  catch (e) { grid.appendChild(el('div', 'empty', 'Could not load events.')); return; }
  if (!events.length) { grid.appendChild(el('div', 'empty', 'No events yet — create your first above.')); return; }
  for (const ev of events) {
    const card = el('button', 'event-card');
    card.appendChild(el('h3', null, ev.name));
    const meta = [ev.event_date ? new Date(ev.event_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null, ev.venue].filter(Boolean).join(' · ');
    card.appendChild(el('div', 'meta', meta || 'No date set'));
    const counts = el('div', 'counts');
    counts.appendChild(el('span', 'pill', `${ev.table_count} tables`));
    counts.appendChild(el('span', 'pill', `${ev.guest_count} guests`));
    card.appendChild(counts);
    card.addEventListener('click', () => { location.hash = `#/event/${ev.id}`; });
    grid.appendChild(card);
  }
}

$('#new-event-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const name = f.name.value.trim();
  if (!name) return;
  try {
    const ev = await api('POST', '/api/events', {
      name, event_date: f.event_date.value || null, venue: f.venue.value.trim() || null,
    });
    f.reset();
    toast('Event created');
    location.hash = `#/event/${ev.id}`;
  } catch (err) { toast(err.message, true); }
});

// ---------- event view ----------
async function openEvent(id) {
  try { current = await api('GET', `/api/events/${id}`); }
  catch (e) { toast('Event not found', true); location.hash = ''; return; }
  showEvent();
  $('#event-title').textContent = current.name;
  const meta = [current.event_date ? new Date(current.event_date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : null, current.venue].filter(Boolean).join(' · ');
  $('#event-meta').textContent = meta;
  $('#export-btn').setAttribute('href', `/api/events/${current.id}/export.csv`);
  renderCanvas();
  renderGuests();
}

$('#back-btn').addEventListener('click', () => { location.hash = ''; });

// seat geometry: returns [{x,y}] offsets from table center
function seatPositions(table) {
  const n = table.seats;
  const pts = [];
  if (table.shape === 'round') {
    const size = Math.min(210, Math.max(110, 96 + n * 7));
    const R = size / 2 + 22;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      pts.push({ x: R * Math.cos(a), y: R * Math.sin(a) });
    }
    return { pts, w: size, h: size };
  }
  // long
  const top = Math.ceil(n / 2), bot = n - top;
  const w = Math.min(380, Math.max(160, 60 + top * 34));
  const h = 84;
  const place = (count, y) => {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      pts.push({ x: -w / 2 + 22 + t * (w - 44), y });
    }
  };
  place(top, -(h / 2 + 22));
  place(bot, h / 2 + 22);
  return { pts, w, h };
}

function guestAt(tableId, seatIndex) {
  return current.guests.find((g) => g.table_id === tableId && g.seat_index === seatIndex);
}

function renderCanvas() {
  const canvas = $('#canvas');
  // remove existing table nodes (keep the hint)
  canvas.querySelectorAll('.table-node').forEach((n) => n.remove());

  for (const table of current.tables) {
    const { pts, w, h } = seatPositions(table);
    const filled = current.guests.filter((g) => g.table_id === table.id).length;

    const node = el('div', 'table-node');
    node.style.left = table.x + 'px';
    node.style.top = table.y + 'px';
    node.dataset.tableId = table.id;
    if (filled >= table.seats) node.classList.add('full');

    const shape = el('div', `table-shape ${table.shape}`);
    shape.style.width = w + 'px';
    shape.style.height = h + 'px';
    const lab = el('div', 'table-label', table.label);
    shape.appendChild(lab);
    shape.appendChild(el('div', 'table-count', `${filled}/${table.seats}`));
    node.appendChild(shape);

    // seats
    pts.forEach((p, i) => {
      const seat = el('div', 'seat');
      seat.style.left = p.x + 'px';
      seat.style.top = p.y + 'px';
      seat.dataset.seat = i;
      seat.dataset.tableId = table.id;
      const g = guestAt(table.id, i);
      if (g) {
        seat.classList.add('filled');
        seat.textContent = initials(g.name);
        seat.title = g.name;
        seat.dataset.guestId = g.id;
        seat.addEventListener('pointerdown', (e) => startGuestDrag(e, g.id));
      }
      node.appendChild(seat);
    });

    // tools
    const tools = el('div', 'table-tools');
    const rename = el('button', 'btn-ghost btn-sm', '✎');
    rename.title = 'Rename';
    rename.addEventListener('pointerdown', (e) => e.stopPropagation());
    rename.addEventListener('click', (e) => { e.stopPropagation(); renameTable(table); });
    const minus = el('button', 'btn-ghost btn-sm', '−');
    minus.title = 'Fewer seats';
    minus.addEventListener('pointerdown', (e) => e.stopPropagation());
    minus.addEventListener('click', (e) => { e.stopPropagation(); changeSeats(table, -1); });
    const plus = el('button', 'btn-ghost btn-sm', '+');
    plus.title = 'More seats';
    plus.addEventListener('pointerdown', (e) => e.stopPropagation());
    plus.addEventListener('click', (e) => { e.stopPropagation(); changeSeats(table, +1); });
    const del = el('button', 'btn-danger btn-sm', '🗑');
    del.title = 'Delete table';
    del.addEventListener('pointerdown', (e) => e.stopPropagation());
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteTable(table); });
    tools.append(rename, minus, plus, del);
    node.appendChild(tools);

    // table drag (start on shape body)
    shape.addEventListener('pointerdown', (e) => startTableDrag(e, node, table));

    canvas.appendChild(node);
  }
}

function renderGuests() {
  const list = $('#guest-list');
  list.innerHTML = '';
  const unassigned = current.guests.filter((g) => !g.table_id);
  const total = current.guests.length;
  const seated = total - unassigned.length;
  $('#guest-sub').textContent = total === 0
    ? 'Import a CSV to add your guest list.'
    : `${seated} of ${total} seated · ${unassigned.length} to place`;

  for (const g of unassigned) {
    const chip = el('div', 'guest-chip');
    chip.appendChild(el('span', 'dot'));
    chip.appendChild(el('span', 'gname', g.name));
    chip.dataset.guestId = g.id;
    chip.addEventListener('pointerdown', (e) => startGuestDrag(e, g.id));
    list.appendChild(chip);
  }
  if (!unassigned.length && total) {
    list.appendChild(el('div', 'empty', 'Everyone has a seat 🎉'));
  }
}

// ---------- table drag ----------
function startTableDrag(e, node, table) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  const canvas = $('#canvas');
  const rect = canvas.getBoundingClientRect();
  const startX = e.clientX, startY = e.clientY;
  const origX = table.x, origY = table.y;
  let moved = false;
  node.classList.add('dragging');

  function move(ev) {
    const dx = ev.clientX - startX, dy = ev.clientY - startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
    let nx = origX + dx, ny = origY + dy;
    nx = Math.max(40, Math.min(rect.width - 40, nx));
    ny = Math.max(40, Math.min(rect.height - 40, ny));
    table.x = nx; table.y = ny;
    node.style.left = nx + 'px';
    node.style.top = ny + 'px';
  }
  async function up() {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    node.classList.remove('dragging');
    if (moved) {
      try { await api('PATCH', `/api/tables/${table.id}`, { x: table.x, y: table.y }); }
      catch (err) { toast('Could not save position', true); }
    }
  }
  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

// ---------- guest drag (assign / reassign / unassign) ----------
function startGuestDrag(e, guestId) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault();
  e.stopPropagation();
  const guest = current.guests.find((g) => g.id === guestId);
  if (!guest) return;

  const ghost = el('div', 'drag-ghost', firstName(guest.name));
  ghost.style.left = e.clientX + 'px';
  ghost.style.top = e.clientY + 'px';
  document.body.appendChild(ghost);
  let hoverSeat = null;
  const panel = $('#guests-panel');

  function setHover(seat) {
    if (hoverSeat && hoverSeat !== seat) hoverSeat.classList.remove('seat-hover');
    hoverSeat = seat;
    if (seat) seat.classList.add('seat-hover');
  }

  function move(ev) {
    ghost.style.left = ev.clientX + 'px';
    ghost.style.top = ev.clientY + 'px';
    ghost.style.display = 'none';
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    ghost.style.display = '';
    const seat = under && under.closest ? under.closest('.seat') : null;
    setHover(seat && seat.dataset.tableId ? seat : null);
    const overPanel = under && under.closest && under.closest('#guests-panel');
    panel.classList.toggle('drop-active', !!overPanel && !seat);
  }

  async function up(ev) {
    document.removeEventListener('pointermove', move);
    document.removeEventListener('pointerup', up);
    ghost.remove();
    panel.classList.remove('drop-active');
    if (hoverSeat) hoverSeat.classList.remove('seat-hover');

    ghost.style.display = 'none';
    const under = document.elementFromPoint(ev.clientX, ev.clientY);
    ghost.style.display = '';
    const seat = under && under.closest ? under.closest('.seat') : null;
    const overPanel = under && under.closest && under.closest('#guests-panel');

    try {
      if (seat && seat.dataset.tableId) {
        const tableId = seat.dataset.tableId;
        const seatIndex = parseInt(seat.dataset.seat, 10);
        const updated = await api('PATCH', `/api/guests/${guestId}`, { table_id: tableId, seat_index: seatIndex });
        mergeGuest(updated);
        // an occupant may have been kicked to unassigned — refetch to stay truthful
        await refreshGuests();
        toast(`${firstName(guest.name)} seated`);
      } else if (overPanel) {
        if (guest.table_id) {
          const updated = await api('PATCH', `/api/guests/${guestId}`, { table_id: null, seat_index: null });
          mergeGuest(updated);
          toast(`${firstName(guest.name)} unseated`);
        }
      }
    } catch (err) {
      toast(err.message || 'Could not move guest', true);
      await refreshGuests();
    }
  }

  document.addEventListener('pointermove', move);
  document.addEventListener('pointerup', up);
}

function mergeGuest(updated) {
  const i = current.guests.findIndex((g) => g.id === updated.id);
  if (i > -1) current.guests[i] = updated;
  renderCanvas();
  renderGuests();
}

async function refreshGuests() {
  try {
    const fresh = await api('GET', `/api/events/${current.id}`);
    current.guests = fresh.guests;
    current.tables = fresh.tables;
    renderCanvas();
    renderGuests();
  } catch (_) {}
}

// ---------- table ops ----------
$('#add-table-btn').addEventListener('click', async () => {
  const shape = $('#table-shape').value;
  const seats = Math.max(1, Math.min(20, parseInt($('#table-seats').value, 10) || 6));
  // stagger new tables so they don't stack
  const n = current.tables.length;
  const x = 150 + (n % 4) * 160;
  const y = 140 + Math.floor(n / 4) * 190;
  try {
    const table = await api('POST', `/api/events/${current.id}/tables`, { shape, seats, x, y });
    current.tables.push(table);
    renderCanvas();
    toast('Table added');
  } catch (err) { toast(err.message, true); }
});

async function renameTable(table) {
  const name = prompt('Table name', table.label);
  if (name == null) return;
  try {
    const updated = await api('PATCH', `/api/tables/${table.id}`, { label: name.trim() || table.label });
    Object.assign(table, updated);
    renderCanvas();
  } catch (err) { toast(err.message, true); }
}

async function changeSeats(table, delta) {
  const seats = Math.max(1, Math.min(20, table.seats + delta));
  if (seats === table.seats) return;
  try {
    const updated = await api('PATCH', `/api/tables/${table.id}`, { seats });
    Object.assign(table, updated);
    await refreshGuests(); // seats shrinking may free guests beyond range on server? keep truthful
  } catch (err) { toast(err.message, true); }
}

async function deleteTable(table) {
  if (!confirm(`Delete “${table.label}”? Guests there will be unseated.`)) return;
  try {
    await api('DELETE', `/api/tables/${table.id}`);
    current.tables = current.tables.filter((t) => t.id !== table.id);
    await refreshGuests();
    toast('Table removed');
  } catch (err) { toast(err.message, true); }
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
    await refreshGuests();
    toast(`Imported ${result.imported} guests`);
  } catch (err) { toast(err.message, true); }
  e.target.value = '';
});

// ---------- go ----------
route();
