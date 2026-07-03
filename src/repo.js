// Data access layer. All UUIDs generated app-side for portability.
'use strict';

const { randomUUID } = require('crypto');
const db = require('./db');

// ---------- events ----------
async function listEvents() {
  const events = (await db.query(
    'SELECT id, name, event_date, venue, created_at FROM events ORDER BY created_at DESC'
  )).rows;
  const tc = (await db.query('SELECT event_id, count(*) AS c FROM tables GROUP BY event_id')).rows;
  const gc = (await db.query('SELECT event_id, count(*) AS c FROM guests GROUP BY event_id')).rows;
  const tm = new Map(tc.map((r) => [r.event_id, parseInt(r.c, 10)]));
  const gm = new Map(gc.map((r) => [r.event_id, parseInt(r.c, 10)]));
  return events.map((e) => ({
    ...e,
    table_count: tm.get(e.id) || 0,
    guest_count: gm.get(e.id) || 0,
  }));
}

async function createEvent({ name, event_date, venue }) {
  const id = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO events(id, name, event_date, venue) VALUES ($1,$2,$3,$4)
     RETURNING id, name, event_date, venue, created_at`,
    [id, name, event_date || null, venue || null]
  );
  return rows[0];
}

async function getEvent(id) {
  const ev = await db.query('SELECT id, name, event_date, venue, created_at FROM events WHERE id=$1', [id]);
  if (ev.rows.length === 0) return null;
  const tables = await db.query(
    'SELECT id, event_id, label, shape, seats, x, y FROM tables WHERE event_id=$1 ORDER BY created_at',
    [id]
  );
  const guests = await db.query(
    'SELECT id, event_id, name, email, notes, table_id, seat_index FROM guests WHERE event_id=$1 ORDER BY name',
    [id]
  );
  return { ...ev.rows[0], tables: tables.rows, guests: guests.rows };
}

// ---------- tables ----------
async function addTable(eventId, { label, shape, seats, x, y }) {
  const id = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO tables(id, event_id, label, shape, seats, x, y)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, event_id, label, shape, seats, x, y`,
    [id, eventId, label, shape, seats, x ?? 120, y ?? 120]
  );
  return rows[0];
}

async function updateTable(id, patch) {
  const allowed = ['label', 'shape', 'seats', 'x', 'y'];
  const sets = [];
  const vals = [];
  let i = 1;
  for (const key of allowed) {
    if (patch[key] !== undefined) {
      sets.push(`${key}=$${i++}`);
      vals.push(patch[key]);
    }
  }
  if (sets.length === 0) return getTable(id);
  vals.push(id);
  const { rows } = await db.query(
    `UPDATE tables SET ${sets.join(', ')} WHERE id=$${i} RETURNING id, event_id, label, shape, seats, x, y`,
    vals
  );
  return rows[0] || null;
}

async function getTable(id) {
  const { rows } = await db.query('SELECT id, event_id, label, shape, seats, x, y FROM tables WHERE id=$1', [id]);
  return rows[0] || null;
}

async function deleteTable(id) {
  // guests at this table are freed (FK ON DELETE SET NULL leaves seat_index; clear it too)
  await db.query('UPDATE guests SET table_id=NULL, seat_index=NULL WHERE table_id=$1', [id]);
  await db.query('DELETE FROM tables WHERE id=$1', [id]);
}

// ---------- guests ----------
async function importGuests(eventId, guests) {
  const created = [];
  await db.withTransaction(async (client) => {
    for (const g of guests) {
      const id = randomUUID();
      const { rows } = await client.query(
        `INSERT INTO guests(id, event_id, name, email, notes) VALUES ($1,$2,$3,$4,$5)
         RETURNING id, event_id, name, email, notes, table_id, seat_index`,
        [id, eventId, g.name, g.email || null, g.notes || null]
      );
      created.push(rows[0]);
    }
  });
  return created;
}

async function addGuest(eventId, { name, email, notes }) {
  const id = randomUUID();
  const { rows } = await db.query(
    `INSERT INTO guests(id, event_id, name, email, notes) VALUES ($1,$2,$3,$4,$5)
     RETURNING id, event_id, name, email, notes, table_id, seat_index`,
    [id, eventId, name, email || null, notes || null]
  );
  return rows[0];
}

// Assign / reassign / unassign. Enforces one-guest-per-seat inside a transaction.
// patch: { table_id: string|null, seat_index: number|null }
async function updateGuest(id, patch) {
  return db.withTransaction(async (client) => {
    const cur = await client.query('SELECT id, event_id, table_id, seat_index FROM guests WHERE id=$1', [id]);
    if (cur.rows.length === 0) return { error: 'not_found' };
    const guest = cur.rows[0];

    const nextTable = patch.table_id === undefined ? guest.table_id : patch.table_id;
    const nextSeat = patch.seat_index === undefined ? guest.seat_index : patch.seat_index;

    if (nextTable) {
      // validate table exists, belongs to same event, and seat within range
      const t = await client.query('SELECT seats FROM tables WHERE id=$1 AND event_id=$2', [nextTable, guest.event_id]);
      if (t.rows.length === 0) return { error: 'bad_table' };
      if (nextSeat == null || nextSeat < 0 || nextSeat >= t.rows[0].seats) return { error: 'bad_seat' };
      // free any current occupant of the target seat (kick to unassigned) — makes drag-swap forgiving
      await client.query(
        'UPDATE guests SET table_id=NULL, seat_index=NULL WHERE table_id=$1 AND seat_index=$2 AND id<>$3',
        [nextTable, nextSeat, id]
      );
    }

    const { rows } = await client.query(
      `UPDATE guests SET table_id=$1, seat_index=$2 WHERE id=$3
       RETURNING id, event_id, name, email, notes, table_id, seat_index`,
      [nextTable || null, nextTable ? nextSeat : null, id]
    );
    return { guest: rows[0] };
  });
}

async function deleteGuest(id) {
  await db.query('DELETE FROM guests WHERE id=$1', [id]);
}

// ---------- export ----------
async function exportRows(eventId) {
  const { rows } = await db.query(
    `SELECT g.name, g.email, g.notes, t.label AS table_label, g.seat_index
     FROM guests g
     LEFT JOIN tables t ON t.id = g.table_id
     WHERE g.event_id=$1
     ORDER BY (t.label IS NULL), t.label, g.seat_index, g.name`,
    [eventId]
  );
  return rows;
}

module.exports = {
  listEvents, createEvent, getEvent,
  addTable, updateTable, getTable, deleteTable,
  importGuests, addGuest, updateGuest, deleteGuest,
  exportRows,
};
