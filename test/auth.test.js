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

test('static-asset paths never attempt the refresh grant; documents do', async () => {
  const prevEnv = { NODE_ENV: process.env.NODE_ENV, SUPABASE_URL: process.env.SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY };
  const realFetch = global.fetch;
  const refreshCalls = [];
  process.env.NODE_ENV = 'production'; // real verify path, not the bypass
  process.env.SUPABASE_URL = 'https://example.invalid';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'pk-test';
  // intercept only token-grant calls; pass everything else (our own test
  // requests) through to the real fetch
  global.fetch = (url, opts) => {
    if (String(url).includes('/auth/v1/token')) {
      refreshCalls.push(String(url));
      return Promise.resolve({ ok: false });
    }
    return realFetch(url, opts);
  };
  try {
    const cookies = { Cookie: 'sb_at=not-a-jwt; sb_rt=some-refresh-token' };
    // static asset (non-.html extension): bad token → straight to unauthorized
    const asset = await get('/assets/app.js', cookies);
    assert.equal(asset.status, 302, 'asset request redirected');
    assert.equal(refreshCalls.length, 0, 'no refresh grant fired for a static asset');
    // document request: the one refresh attempt IS made (and fails → 302)
    const page = await get('/page', cookies);
    assert.equal(page.status, 302);
    assert.equal(refreshCalls.length, 1, 'exactly one refresh grant for the document');
  } finally {
    global.fetch = realFetch;
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
});
