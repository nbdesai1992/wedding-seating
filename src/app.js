'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const db = require('./db');
const auth = require('./auth');
const repo = require('./repo');
const { guestsFromCsv, toCsv } = require('./csv');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

function asyncH(fn) {
  return (req, res) => Promise.resolve(fn(req, res)).catch((err) => {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });
}

function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // ---- open endpoints: health, auth flow, and login-page assets ----
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  auth.routes(app); // GET/POST /login, GET /auth/callback, POST /logout

  const pub = path.join(__dirname, '..', 'public');
  app.get('/styles.css', (req, res) => res.sendFile(path.join(pub, 'styles.css')));

  // ---- everything below requires an active member of this app ----
  app.use(auth.requireMember(db));

  // ---- session ----
  app.get('/api/me', (req, res) => res.json({ email: req.user.email, role: req.user.role }));

  // ---- guest-list admin (SPEC-004 R2/R3; role checked per request) ----
  const EMAIL_RE = /^[a-z0-9][a-z0-9._%+-]*@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
  const MEMBER_COLS = 'email, role, status, invited_by, invited_at';
  // rails throw this from inside the transaction; the route turns it into 4xx
  function rail(status, body) {
    const e = new Error(body.error);
    e.rail = { status, body };
    return e;
  }
  function railOr500(res, err) {
    if (err.rail) return res.status(err.rail.status).json(err.rail.body);
    throw err;
  }

  app.get('/api/admin/members', auth.requireAdmin, asyncH(async (req, res) => {
    const { rows } = await db.query(
      `SELECT ${MEMBER_COLS} FROM app_members ORDER BY invited_at, email`);
    const activeAdmins = rows.filter((r) => r.role === 'admin' && r.status === 'active').length;
    res.json(rows.map((r) => ({
      ...r,
      isSelf: r.email === req.user.email,
      isLastAdmin: r.role === 'admin' && r.status === 'active' && activeAdmins === 1,
    })));
  }));

  app.post('/api/admin/members', auth.requireAdmin, asyncH(async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = req.body?.role === 'admin' ? 'admin' : 'member';
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'invalid_email', message: 'That doesn’t look like an email address.' });
    }
    // explicit pre-check for the 409 (pg-mem mishandles ON CONFLICT+RETURNING);
    // ON CONFLICT stays as race-safety on real Postgres.
    const dup = await db.query('SELECT 1 FROM app_members WHERE email = $1', [email]);
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'already_member', message: `${email} is already on the list.` });
    }
    const ins = await db.query(
      `INSERT INTO app_members (email, role, invited_by) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING ${MEMBER_COLS}`,
      [email, role, req.user.email]);
    if (ins.rows.length === 0) {
      return res.status(409).json({ error: 'already_member', message: `${email} is already on the list.` });
    }
    res.status(201).json(ins.rows[0]);
  }));

  app.patch('/api/admin/members/:email', auth.requireAdmin, asyncH(async (req, res) => {
    const target = String(req.params.email || '').trim().toLowerCase();
    const patch = {};
    if (req.body?.role !== undefined) {
      if (!['admin', 'member'].includes(req.body.role)) return res.status(400).json({ error: 'invalid_role' });
      patch.role = req.body.role;
    }
    if (req.body?.status !== undefined) {
      if (!['active', 'blocked'].includes(req.body.status)) return res.status(400).json({ error: 'invalid_status' });
      patch.status = req.body.status;
    }
    if (patch.role === undefined && patch.status === undefined) {
      return res.status(400).json({ error: 'nothing_to_change' });
    }
    if (target === req.user.email && patch.status === 'blocked') {
      return res.status(400).json({ error: 'self_block', message: 'You can’t block yourself.' });
    }
    try {
      const updated = await db.withTransaction(async (client) => {
        const cur = await client.query('SELECT email, role, status FROM app_members WHERE email = $1', [target]);
        if (cur.rows.length === 0) throw rail(404, { error: 'not_found' });
        const row = cur.rows[0];
        const losesAdmin = row.role === 'admin' && row.status === 'active' &&
          ((patch.role !== undefined && patch.role !== 'admin') ||
           (patch.status !== undefined && patch.status !== 'active'));
        if (losesAdmin) {
          const c = await client.query(
            "SELECT count(*) AS n FROM app_members WHERE role = 'admin' AND status = 'active'");
          if (Number(c.rows[0].n) <= 1) {
            throw rail(409, { error: 'last_admin', message: 'The last admin stays — promote someone else first.' });
          }
        }
        const u = await client.query(
          `UPDATE app_members SET role = $2, status = $3 WHERE email = $1 RETURNING ${MEMBER_COLS}`,
          [target, patch.role ?? row.role, patch.status ?? row.status]);
        return u.rows[0];
      });
      res.json(updated);
    } catch (err) { railOr500(res, err); }
  }));

  app.delete('/api/admin/members/:email', auth.requireAdmin, asyncH(async (req, res) => {
    const target = String(req.params.email || '').trim().toLowerCase();
    if (target === req.user.email) {
      return res.status(400).json({ error: 'self_remove', message: 'You can’t remove yourself.' });
    }
    try {
      await db.withTransaction(async (client) => {
        const cur = await client.query('SELECT role, status FROM app_members WHERE email = $1', [target]);
        if (cur.rows.length === 0) throw rail(404, { error: 'not_found' });
        if (cur.rows[0].role === 'admin' && cur.rows[0].status === 'active') {
          const c = await client.query(
            "SELECT count(*) AS n FROM app_members WHERE role = 'admin' AND status = 'active'");
          if (Number(c.rows[0].n) <= 1) {
            throw rail(409, { error: 'last_admin', message: 'The last admin stays — promote someone else first.' });
          }
        }
        await client.query('DELETE FROM app_members WHERE email = $1', [target]);
      });
      res.json({ ok: true });
    } catch (err) { railOr500(res, err); }
  }));

  // ---- events ----
  app.get('/api/events', asyncH(async (req, res) => {
    res.json(await repo.listEvents());
  }));

  app.post('/api/events', asyncH(async (req, res) => {
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name_required' });
    const event = await repo.createEvent({
      name,
      event_date: req.body.event_date || null,
      venue: (req.body.venue || '').trim() || null,
    });
    res.status(201).json(event);
  }));

  app.get('/api/events/:id', asyncH(async (req, res) => {
    const event = await repo.getEvent(req.params.id);
    if (!event) return res.status(404).json({ error: 'not_found' });
    res.json(event);
  }));

  // ---- tables ----
  app.post('/api/events/:id/tables', asyncH(async (req, res) => {
    const ev = await repo.getEvent(req.params.id);
    if (!ev) return res.status(404).json({ error: 'not_found' });
    const shape = req.body.shape === 'long' ? 'long' : 'round';
    const kind = ['head', 'sweetheart'].includes(req.body.kind) ? req.body.kind : 'standard';
    let seats = parseInt(req.body.seats, 10);
    if (!Number.isFinite(seats)) seats = kind === 'sweetheart' ? 2 : (shape === 'long' ? 8 : 6);
    seats = Math.max(1, Math.min(20, seats));
    const label = (req.body.label || '').trim() ||
      (kind === 'head' ? 'Head Table' : kind === 'sweetheart' ? 'Sweetheart' : `Table ${ev.tables.length + 1}`);
    const table = await repo.addTable(req.params.id, {
      label, shape, seats, kind,
      orientation: req.body.orientation === 'vertical' ? 'vertical' : 'horizontal',
      x: Number.isFinite(+req.body.x) ? +req.body.x : 120,
      y: Number.isFinite(+req.body.y) ? +req.body.y : 120,
    });
    res.status(201).json(table);
  }));

  app.patch('/api/tables/:id', asyncH(async (req, res) => {
    const patch = {};
    if (req.body.label !== undefined) patch.label = String(req.body.label).trim() || 'Table';
    if (req.body.shape !== undefined) patch.shape = req.body.shape === 'long' ? 'long' : 'round';
    if (req.body.seats !== undefined) patch.seats = Math.max(1, Math.min(20, parseInt(req.body.seats, 10) || 1));
    if (req.body.kind !== undefined) patch.kind = ['head', 'sweetheart'].includes(req.body.kind) ? req.body.kind : 'standard';
    if (req.body.orientation !== undefined) patch.orientation = req.body.orientation === 'vertical' ? 'vertical' : 'horizontal';
    if (req.body.x !== undefined) patch.x = +req.body.x;
    if (req.body.y !== undefined) patch.y = +req.body.y;
    const table = await repo.updateTable(req.params.id, patch);
    if (!table) return res.status(404).json({ error: 'not_found' });
    res.json(table);
  }));

  app.delete('/api/tables/:id', asyncH(async (req, res) => {
    await repo.deleteTable(req.params.id);
    res.json({ ok: true });
  }));

  // ---- guests ----
  app.post('/api/events/:id/guests', asyncH(async (req, res) => {
    const ev = await repo.getEvent(req.params.id);
    if (!ev) return res.status(404).json({ error: 'not_found' });
    const name = (req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name_required' });
    const guest = await repo.addGuest(req.params.id, {
      name, email: (req.body.email || '').trim() || null, notes: (req.body.notes || '').trim() || null,
      party: (req.body.party || '').trim() || null,
    });
    res.status(201).json(guest);
  }));

  app.post('/api/events/:id/guests/import', upload.single('file'), asyncH(async (req, res) => {
    const ev = await repo.getEvent(req.params.id);
    if (!ev) return res.status(404).json({ error: 'not_found' });
    const raw = req.file ? req.file.buffer.toString('utf8') : (req.body.csv || '');
    if (!raw.trim()) return res.status(400).json({ error: 'empty_file' });
    const { guests, error } = guestsFromCsv(raw);
    if (error) return res.status(400).json({ error: 'bad_csv', message: error });
    const created = await repo.importGuests(req.params.id, guests);
    res.status(201).json({ imported: created.length, guests: created });
  }));

  app.patch('/api/guests/:id', asyncH(async (req, res) => {
    const patch = {};
    if ('table_id' in req.body) patch.table_id = req.body.table_id || null;
    if ('seat_index' in req.body) patch.seat_index = req.body.seat_index == null ? null : parseInt(req.body.seat_index, 10);
    const result = await repo.updateGuest(req.params.id, patch);
    if (result.error === 'not_found') return res.status(404).json({ error: 'not_found' });
    if (result.error) return res.status(400).json({ error: result.error });
    res.json(result.guest);
  }));

  app.delete('/api/guests/:id', asyncH(async (req, res) => {
    await repo.deleteGuest(req.params.id);
    res.json({ ok: true });
  }));

  // ---- fixtures (non-seating room shapes) ----
  const FIXTURE_PRESETS = {
    dj:     { label: 'DJ Booth',   shape: 'rect',  w: 140, h: 70 },
    buffet: { label: 'Buffet',     shape: 'rect',  w: 220, h: 70 },
    bar:    { label: 'Bar',        shape: 'rect',  w: 180, h: 70 },
    dance:  { label: 'Dance Floor', shape: 'rect', w: 260, h: 160 },
    stage:  { label: 'Stage',      shape: 'rect',  w: 240, h: 100 },
    cake:   { label: 'Cake Table', shape: 'round', w: 90,  h: 90 },
    gifts:  { label: 'Gift Table', shape: 'rect',  w: 110, h: 70 },
    custom: { label: 'Room Item',  shape: 'rect',  w: 140, h: 90 },
  };

  app.post('/api/events/:id/fixtures', asyncH(async (req, res) => {
    const ev = await repo.getEvent(req.params.id);
    if (!ev) return res.status(404).json({ error: 'not_found' });
    const ftype = FIXTURE_PRESETS[req.body.ftype] ? req.body.ftype : 'custom';
    const preset = FIXTURE_PRESETS[ftype];
    const label = (req.body.label || '').trim() || preset.label;
    const fixture = await repo.addFixture(req.params.id, {
      label, ftype, shape: preset.shape, w: preset.w, h: preset.h,
      x: Number.isFinite(+req.body.x) ? +req.body.x : 220,
      y: Number.isFinite(+req.body.y) ? +req.body.y : 220,
    });
    res.status(201).json(fixture);
  }));

  app.patch('/api/fixtures/:id', asyncH(async (req, res) => {
    const patch = {};
    if (req.body.label !== undefined) patch.label = String(req.body.label).trim() || 'Room Item';
    for (const k of ['w', 'h', 'x', 'y']) if (req.body[k] !== undefined) patch[k] = +req.body[k];
    const fixture = await repo.updateFixture(req.params.id, patch);
    if (!fixture) return res.status(404).json({ error: 'not_found' });
    res.json(fixture);
  }));

  app.delete('/api/fixtures/:id', asyncH(async (req, res) => {
    await repo.deleteFixture(req.params.id);
    res.json({ ok: true });
  }));

  // ---- export ----
  app.get('/api/events/:id/export.csv', asyncH(async (req, res) => {
    const ev = await repo.getEvent(req.params.id);
    if (!ev) return res.status(404).json({ error: 'not_found' });
    const rows = await repo.exportRows(req.params.id);
    const out = rows.map((r) => [
      r.name,
      r.email || '',
      r.party || '',
      r.table_label || 'Unassigned',
      r.table_label && r.seat_index != null ? r.seat_index + 1 : '',
      r.notes || '',
    ]);
    const csv = toCsv(['Guest', 'Email', 'Party', 'Table', 'Seat', 'Notes'], out);
    const safe = (ev.name || 'seating').replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'seating';
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}-seating.csv"`);
    res.send(csv);
  }));

  // ---- static frontend ----
  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

module.exports = { createApp };
