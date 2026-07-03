'use strict';

const path = require('path');
const express = require('express');
const multer = require('multer');
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

  app.get('/healthz', (req, res) => res.json({ ok: true }));

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
    let seats = parseInt(req.body.seats, 10);
    if (!Number.isFinite(seats)) seats = shape === 'long' ? 8 : 6;
    seats = Math.max(1, Math.min(20, seats));
    const label = (req.body.label || '').trim() || `Table ${ev.tables.length + 1}`;
    const table = await repo.addTable(req.params.id, {
      label, shape, seats,
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

  // ---- export ----
  app.get('/api/events/:id/export.csv', asyncH(async (req, res) => {
    const ev = await repo.getEvent(req.params.id);
    if (!ev) return res.status(404).json({ error: 'not_found' });
    const rows = await repo.exportRows(req.params.id);
    const out = rows.map((r) => [
      r.name,
      r.email || '',
      r.table_label || 'Unassigned',
      r.table_label && r.seat_index != null ? r.seat_index + 1 : '',
      r.notes || '',
    ]);
    const csv = toCsv(['Guest', 'Email', 'Table', 'Seat', 'Notes'], out);
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
