'use strict';

// End-to-end test over the real HTTP API, backed by an in-process pg-mem
// Postgres so it needs no external database. Covers the full acceptance path:
// create event -> add tables -> import guests CSV -> assign -> export CSV.

const test = require('node:test');
const assert = require('node:assert');
const { newDb } = require('pg-mem');

const db = require('../src/db');

// Wire a pg-mem-backed pool BEFORE anything queries.
const mem = newDb({ noAstCoverageCheck: true });
const pgMem = mem.adapters.createPg();
db.setPool(new pgMem.Pool());

const { run: migrate } = require('../src/migrate');
const { createApp } = require('../src/app');

let base;
let server;

async function req(method, path, body, headers) {
  const opts = { method, headers: headers || {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(base + path, opts);
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data };
}

test.before(async () => {
  await migrate();
  await migrate(); // idempotent: second run must not throw or re-apply
  const app = createApp();
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => { if (server) server.close(); });

test('full seating flow: create -> tables -> import -> assign -> export', async () => {
  // 1. create event
  const created = await req('POST', '/api/events', { name: 'Emma & James', venue: 'The Old Barn' });
  assert.equal(created.status, 201);
  const eventId = created.data.id;
  assert.ok(eventId, 'event has id');

  // 1b. listed + persists (visible to any visitor)
  const list = await req('GET', '/api/events');
  assert.equal(list.status, 200);
  assert.ok(list.data.some((e) => e.id === eventId), 'event appears in list');

  // 2. add tables
  const t1 = await req('POST', `/api/events/${eventId}/tables`, { shape: 'round', seats: 4, x: 120, y: 120 });
  assert.equal(t1.status, 201);
  const table1 = t1.data.id;
  const t2 = await req('POST', `/api/events/${eventId}/tables`, { shape: 'long', seats: 6 });
  assert.equal(t2.status, 201);

  // 2b. move table, position persists across reload
  await req('PATCH', `/api/tables/${table1}`, { x: 260, y: 300 });
  let ev = (await req('GET', `/api/events/${eventId}`)).data;
  const movedt = ev.tables.find((t) => t.id === table1);
  assert.equal(Math.round(movedt.x), 260);
  assert.equal(Math.round(movedt.y), 300);
  assert.equal(ev.tables.length, 2);

  // 2c. table kinds: head + sweetheart variants persist
  const th = await req('POST', `/api/events/${eventId}/tables`, { kind: 'head', seats: 8 });
  assert.equal(th.status, 201);
  assert.equal(th.data.kind, 'head');
  assert.equal(th.data.label, 'Head Table');
  const ts = await req('POST', `/api/events/${eventId}/tables`, { kind: 'sweetheart' });
  assert.equal(ts.data.kind, 'sweetheart');
  assert.equal(ts.data.seats, 2, 'sweetheart defaults to 2 seats');

  // 3. import guests via CSV (party column honored)
  const csv = 'Name,Email,Party\nAda Lovelace,ada@x.com,\nGrace Hopper,grace@x.com,Hopper\n"Curie, Marie",marie@x.com,Hopper\n';
  const imp = await req('POST', `/api/events/${eventId}/guests/import`, { csv });
  assert.equal(imp.status, 201);
  assert.equal(imp.data.imported, 3, 'three guests imported (quoted comma handled)');
  assert.equal(imp.data.guests.filter((g) => g.party === 'Hopper').length, 2, 'party column parsed');

  ev = (await req('GET', `/api/events/${eventId}`)).data;
  assert.equal(ev.guests.length, 3);
  assert.ok(ev.guests.every((g) => !g.table_id), 'all guests start unassigned');
  assert.equal(ev.tables.length, 4, 'round + long + head + sweetheart present');
  const ada = ev.guests.find((g) => g.name === 'Ada Lovelace');
  const grace = ev.guests.find((g) => g.name === 'Grace Hopper');
  const marie = ev.guests.find((g) => g.name === 'Curie, Marie');
  assert.ok(marie, 'quoted-comma name parsed correctly');

  // 4. assign guests to seats
  assert.equal((await req('PATCH', `/api/guests/${ada.id}`, { table_id: table1, seat_index: 0 })).status, 200);
  assert.equal((await req('PATCH', `/api/guests/${grace.id}`, { table_id: table1, seat_index: 1 })).status, 200);

  // reassign ada to a new seat; assignments persist across reload
  await req('PATCH', `/api/guests/${ada.id}`, { table_id: table1, seat_index: 2 });
  ev = (await req('GET', `/api/events/${eventId}`)).data;
  assert.equal(ev.guests.find((g) => g.id === ada.id).seat_index, 2, 'reassignment persisted');
  assert.equal(ev.guests.find((g) => g.id === grace.id).table_id, table1, 'assignment persisted');

  // seat collision: seating marie where grace sits kicks grace to unassigned
  await req('PATCH', `/api/guests/${marie.id}`, { table_id: table1, seat_index: 1 });
  ev = (await req('GET', `/api/events/${eventId}`)).data;
  assert.equal(ev.guests.find((g) => g.id === marie.id).seat_index, 1);
  assert.equal(ev.guests.find((g) => g.id === grace.id).table_id, null, 'displaced guest unseated');

  // unassign ada
  await req('PATCH', `/api/guests/${ada.id}`, { table_id: null, seat_index: null });
  ev = (await req('GET', `/api/events/${eventId}`)).data;
  assert.equal(ev.guests.find((g) => g.id === ada.id).table_id, null, 'unassign persisted');

  // 5. export CSV reflects assignments
  const exp = await fetch(`${base}/api/events/${eventId}/export.csv`);
  assert.equal(exp.status, 200);
  assert.match(exp.headers.get('content-type'), /text\/csv/);
  const text = await exp.text();
  const lines = text.trim().split(/\r?\n/);
  assert.equal(lines[0], 'Guest,Email,Party,Table,Seat,Notes');
  // marie is seated at table1 seat 2 (1-indexed) with a quoted name
  const marieRow = lines.find((l) => l.includes('Curie, Marie'));
  assert.ok(/"Curie, Marie"/.test(marieRow), 'quoted name escaped in export');
  // ada is unassigned now
  const adaRow = lines.find((l) => l.startsWith('Ada Lovelace'));
  assert.ok(/Unassigned/.test(adaRow), 'unassigned guest marked Unassigned in export');
});
