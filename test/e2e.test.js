'use strict';

// End-to-end test over the real HTTP API, backed by an in-process pg-mem
// Postgres so it needs no external database. Covers the full acceptance path:
// create event -> add tables -> import guests CSV -> assign -> export CSV.

// Auth gate (SPEC-003): run the suite through the explicit test hook — the
// bypass is only honored under NODE_ENV=test and still checks app_members.
process.env.NODE_ENV = 'test';
process.env.AUTH_BYPASS = '1';
const MEMBER = 'nbdesai1992@gmail.com'; // seeded by migration 004

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
  const opts = { method, headers: { 'x-test-email': MEMBER, ...(headers || {}) } };
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

  // 4b. rotation: vertical persists and does NOT disturb assignments
  const rot = await req('PATCH', `/api/tables/${table1}`, { orientation: 'vertical' });
  assert.equal(rot.status, 200);
  assert.equal(rot.data.orientation, 'vertical');
  ev = (await req('GET', `/api/events/${eventId}`)).data;
  assert.equal(ev.tables.find((t) => t.id === table1).orientation, 'vertical', 'orientation persisted');
  assert.equal(ev.guests.find((g) => g.id === marie.id).seat_index, 1, 'assignment survives rotation');
  assert.equal(ev.guests.find((g) => g.id === marie.id).table_id, table1, 'guest still at rotated table');

  // 4c. fixtures: create -> rename -> move -> persists -> delete
  const fx = await req('POST', `/api/events/${eventId}/fixtures`, { ftype: 'dj' });
  assert.equal(fx.status, 201);
  assert.equal(fx.data.label, 'DJ Booth');
  const fx2 = await req('POST', `/api/events/${eventId}/fixtures`, { ftype: 'custom', label: 'Photo Booth' });
  assert.equal(fx2.data.label, 'Photo Booth');
  await req('PATCH', `/api/fixtures/${fx.data.id}`, { label: 'DJ Marco', x: 333, y: 222 });
  ev = (await req('GET', `/api/events/${eventId}`)).data;
  assert.equal(ev.fixtures.length, 2, 'fixtures persist on event');
  const dj = ev.fixtures.find((f) => f.id === fx.data.id);
  assert.equal(dj.label, 'DJ Marco', 'fixture rename persisted');
  assert.equal(Math.round(dj.x), 333, 'fixture move persisted');
  assert.equal((await req('DELETE', `/api/fixtures/${fx2.data.id}`)).status, 200);
  ev = (await req('GET', `/api/events/${eventId}`)).data;
  assert.equal(ev.fixtures.length, 1, 'fixture delete persisted');

  // 5. export CSV reflects assignments
  const exp = await fetch(`${base}/api/events/${eventId}/export.csv`, { headers: { 'x-test-email': MEMBER } });
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
  assert.ok(!text.includes('DJ Marco'), 'fixtures never appear in the seating export');
});

// ---- auth gate (SPEC-003 R1/R3): matrix over the real app ----

test('gate: unauthenticated -> 401 JSON on API, redirect on pages, open endpoints open', async () => {
  const api = await fetch(`${base}/api/events`);
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: 'unauthorized' });

  const page = await fetch(`${base}/`, { redirect: 'manual' });
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login');

  const appjs = await fetch(`${base}/app.js`, { redirect: 'manual' });
  assert.equal(appjs.status, 302, 'app assets are gated too');

  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  const login = await fetch(`${base}/login`);
  assert.equal(login.status, 200);
  assert.match(await login.text(), /Sign in with Google/);
  assert.equal((await fetch(`${base}/styles.css`)).status, 200, 'login-page asset stays open');
});

test('gate: non-member -> 403 JSON on API, styled invitation page with email', async () => {
  const api = await fetch(`${base}/api/events`, { headers: { 'x-test-email': 'stranger@example.com' } });
  assert.equal(api.status, 403);
  assert.deepEqual(await api.json(), { error: 'forbidden' });

  const page = await fetch(`${base}/`, { headers: { 'x-test-email': 'stranger@example.com' } });
  assert.equal(page.status, 403);
  const html = await page.text();
  assert.match(html, /by invitation/i);
  assert.match(html, /stranger@example\.com/, '403 page shows the signed-in email');
  assert.match(html, /styles\.css/, '403 page is styled');
});

test('gate: blocked member -> 403 (row status is live, no redeploy)', async () => {
  await db.query("INSERT INTO app_members (email, status) VALUES ('blocked-e2e@example.com', 'blocked')");
  const r = await fetch(`${base}/api/events`, { headers: { 'x-test-email': 'blocked-e2e@example.com' } });
  assert.equal(r.status, 403);
});

test('gate: seeded member still has full access (data intact)', async () => {
  const r = await req('GET', '/api/events');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.data) && r.data.length >= 1, 'member sees existing events');
});

test('gate: /api/me -> 401 unauth, 200 with email for a member', async () => {
  const unauth = await fetch(`${base}/api/me`);
  assert.equal(unauth.status, 401);

  const me = await req('GET', '/api/me');
  assert.equal(me.status, 200);
  assert.deepEqual(me.data, { email: MEMBER, role: 'admin' }, 'owner seeded admin by 005');
});

// ---- admin role + guest-list API (SPEC-004 R1/R2/R3) ----
const ADMIN = MEMBER; // seeded owner; role=admin since migration 005

test('admin: invite -> immediate access, duplicate 409, block/unblock/remove live', async () => {
  // invite (mixed case in, lowercase stored, provenance recorded; a role
  // field is IGNORED — invited rows are always plain members)
  let r = await req('POST', '/api/admin/members', { email: 'Guest.One@Example.com', role: 'admin' });
  assert.equal(r.status, 201);
  assert.equal(r.data.email, 'guest.one@example.com', 'email lowercased');
  assert.equal(r.data.role, 'member', 'invite never grants a role');
  assert.equal(r.data.invited_by, ADMIN, 'provenance recorded');
  assert.equal(r.data.joined_at, null, 'invited, never signed in');

  // pending vs joined: invited until their first request, joined after
  let list = (await req('GET', '/api/admin/members')).data;
  assert.equal(list.find((m) => m.email === 'guest.one@example.com').joined, false, 'still pending');

  // invited email gets in immediately — no redeploy, next request
  const guestH = { 'x-test-email': 'guest.one@example.com' };
  assert.equal((await req('GET', '/api/events', undefined, guestH)).status, 200);

  list = (await req('GET', '/api/admin/members')).data;
  assert.equal(list.find((m) => m.email === 'guest.one@example.com').joined, true, 'first request stamped joined_at');

  // duplicate invite → friendly 409
  r = await req('POST', '/api/admin/members', { email: 'guest.one@example.com' });
  assert.equal(r.status, 409);
  assert.match(r.data.message, /already on the list\./);

  // invalid email → 400
  assert.equal((await req('POST', '/api/admin/members', { email: 'not-an-email' })).status, 400);

  // list carries computed flags for the panel
  r = await req('GET', '/api/admin/members');
  assert.equal(r.status, 200);
  const own = r.data.find((m) => m.email === ADMIN);
  assert.equal(own.isSelf, true);
  assert.equal(own.isLastAdmin, true, 'seed is the only active admin');
  assert.equal(own.joined, true, 'owner seeded as joined by migration 005');
  assert.equal(r.data.find((m) => m.email === 'guest.one@example.com').isLastAdmin, false);

  // block → immediate 403; duplicate invite of a blocked row says so
  assert.equal((await req('PATCH', '/api/admin/members/guest.one@example.com', { status: 'blocked' })).status, 200);
  assert.equal((await req('GET', '/api/events', undefined, guestH)).status, 403);
  r = await req('POST', '/api/admin/members', { email: 'guest.one@example.com' });
  assert.equal(r.status, 409);
  assert.match(r.data.message, /blocked — use welcome back/);

  // unblock → immediate access; remove → 403 again
  assert.equal((await req('PATCH', '/api/admin/members/guest.one@example.com', { status: 'active' })).status, 200);
  assert.equal((await req('GET', '/api/events', undefined, guestH)).status, 200);
  assert.equal((await req('DELETE', '/api/admin/members/guest.one@example.com')).status, 200);
  assert.equal((await req('GET', '/api/events', undefined, guestH)).status, 403);
});

test('member: role in /api/me, 403 on every admin route; unauth admin routes 401', async () => {
  assert.equal((await req('POST', '/api/admin/members', { email: 'plain@example.com' })).status, 201);
  const H = { 'x-test-email': 'plain@example.com' };

  const me = await req('GET', '/api/me', undefined, H);
  assert.deepEqual(me.data, { email: 'plain@example.com', role: 'member' }, 'no panel flag for members');

  for (const [method, p, body] of [
    ['GET', '/api/admin/members', undefined],
    ['POST', '/api/admin/members', { email: 'x@y.co' }],
    ['PATCH', `/api/admin/members/${ADMIN}`, { status: 'blocked' }],
    ['DELETE', `/api/admin/members/${ADMIN}`, undefined],
  ]) {
    const r = await req(method, p, body, H);
    assert.equal(r.status, 403, `${method} ${p} forbidden for plain member`);
  }
  assert.equal((await fetch(`${base}/api/admin/members`)).status, 401, 'unauth admin route');
  // and the failed attempts changed nothing
  assert.equal((await req('GET', '/api/me')).data.role, 'admin');
});

test('rails: last-admin demote/block/remove and self-block/remove -> 4xx', async () => {
  // seed is currently the only active admin
  let r = await req('PATCH', `/api/admin/members/${ADMIN}`, { role: 'member' });
  assert.equal(r.status, 409, 'last-admin demote refused');
  assert.match(r.data.message, /last admin stays/i);
  r = await req('PATCH', `/api/admin/members/${ADMIN}`, { status: 'blocked' });
  assert.ok(r.status === 400 || r.status === 409, 'last-admin/self block refused');
  r = await req('DELETE', `/api/admin/members/${ADMIN}`);
  assert.ok(r.status === 400 || r.status === 409, 'last-admin/self remove refused');

  // with a second active admin the last-admin rail lifts, self rails stay.
  // (invite can't grant admin — promote via PATCH after inviting)
  const inv = await req('POST', '/api/admin/members', { email: 'second.admin@example.com', role: 'admin' });
  assert.equal(inv.status, 201);
  assert.equal(inv.data.role, 'member', 'role field on invite is ignored');
  assert.equal((await req('PATCH', '/api/admin/members/second.admin@example.com', { role: 'admin' })).status, 200);
  r = await req('PATCH', `/api/admin/members/${ADMIN}`, { status: 'blocked' });
  assert.equal(r.status, 400, 'self-block refused even with two admins');
  assert.equal(r.data.error, 'self_block');
  r = await req('PATCH', '/api/admin/members/second.admin@example.com', { role: 'member' });
  assert.equal(r.status, 200, 'demoting a non-last admin is allowed');

  // unknown target → 404
  assert.equal((await req('PATCH', '/api/admin/members/ghost@example.com', { status: 'blocked' })).status, 404);
  assert.equal((await req('DELETE', '/api/admin/members/ghost@example.com')).status, 404);

  // cleanup: seed remains sole active admin
  assert.equal((await req('DELETE', '/api/admin/members/second.admin@example.com')).status, 200);
  assert.equal((await req('DELETE', '/api/admin/members/plain@example.com')).status, 200);
  const list = (await req('GET', '/api/admin/members')).data;
  assert.equal(list.find((m) => m.email === ADMIN).isLastAdmin, true);
});

test('gate: auth callback provider-error / missing-code -> gentle login notice', async () => {
  const err = await fetch(`${base}/auth/callback?error=access_denied`, { redirect: 'manual' });
  assert.equal(err.status, 302);
  assert.equal(err.headers.get('location'), '/login?err=invite');

  const noCode = await fetch(`${base}/auth/callback`, { redirect: 'manual' });
  assert.equal(noCode.status, 302);
  assert.equal(noCode.headers.get('location'), '/login?err=invite');

  // the login page carries the styled notice + the script that reveals it
  const login = await (await fetch(`${base}/login`)).text();
  assert.match(login, /err-note/, 'login page contains the invite notice element');
  assert.match(login, /doesn&rsquo;t have an invitation yet/, 'notice copy present');
});
