'use strict';

// Unit-ish tests for the requireMember middleware over pg-mem, exercising the
// 401/403/200 matrix through the AUTH_BYPASS test hook (NODE_ENV=test only).
// The JWKS/refresh network paths are deliberately thin and covered by the
// live test (test/live_auth_test.sh) instead.

process.env.NODE_ENV = 'test';
process.env.AUTH_BYPASS = '1';

const test = require('node:test');
const assert = require('node:assert');
const express = require('express');
const cookieParser = require('cookie-parser');
const { newDb } = require('pg-mem');

const db = require('../src/db');

const mem = newDb({ noAstCoverageCheck: true });
const pgMem = mem.adapters.createPg();
db.setPool(new pgMem.Pool());

const { run: migrate } = require('../src/migrate');
const { requireMember } = require('../src/auth');

let base;
let server;

test.before(async () => {
  await migrate();
  await db.query("INSERT INTO app_members (email, status) VALUES ('blocked@example.com', 'blocked')");

  const app = express();
  app.use(cookieParser());
  app.use(requireMember(db));
  app.get('/api/ping', (req, res) => res.json({ ok: true, email: req.user.email }));
  app.get('/page', (req, res) => res.send('page'));
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => { if (server) server.close(); });

async function get(path, headers) {
  return fetch(base + path, { headers: headers || {}, redirect: 'manual' });
}

test('unauthenticated: API 401 JSON, page redirects to /login', async () => {
  const api = await get('/api/ping');
  assert.equal(api.status, 401);
  assert.deepEqual(await api.json(), { error: 'unauthorized' });

  const page = await get('/page');
  assert.equal(page.status, 302);
  assert.equal(page.headers.get('location'), '/login');
});

test('active member passes; email lowercased on req.user', async () => {
  const r = await get('/api/ping', { 'x-test-email': 'NBDesai1992@Gmail.com' });
  assert.equal(r.status, 200);
  const body = await r.json();
  assert.equal(body.email, 'nbdesai1992@gmail.com');
});

test('non-member gets 403 JSON on API', async () => {
  const r = await get('/api/ping', { 'x-test-email': 'stranger@example.com' });
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { error: 'forbidden' });
});

test('blocked member gets 403 (status row is the source of truth)', async () => {
  const r = await get('/api/ping', { 'x-test-email': 'blocked@example.com' });
  assert.equal(r.status, 403);
});

test('bypass is dead outside NODE_ENV=test', async () => {
  const prev = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    // header alone must NOT grant identity; no cookies → unauthorized
    const r = await get('/api/ping', { 'x-test-email': 'nbdesai1992@gmail.com' });
    assert.equal(r.status, 401);
  } finally {
    process.env.NODE_ENV = prev;
  }
});
