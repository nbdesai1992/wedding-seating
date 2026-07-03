// Central database access. Production uses node-postgres against DATABASE_URL.
// Tests inject a pg-mem-backed pool via setPool() so the same SQL runs in-process.
'use strict';

let pool = null;

function isProd() {
  return process.env.NODE_ENV === 'production' || /render\.com/.test(process.env.DATABASE_URL || '');
}

function getPool() {
  if (pool) return pool;
  const { Pool } = require('pg');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  // Render-managed Postgres requires SSL; local/self-managed typically does not.
  const ssl = /render\.com|amazonaws\.com/.test(connectionString)
    ? { rejectUnauthorized: false }
    : undefined;
  pool = new Pool({ connectionString, ssl });
  return pool;
}

// Test hook: supply a pre-built pool (e.g. from pg-mem).
function setPool(p) {
  pool = p;
}

function query(text, params) {
  return getPool().query(text, params);
}

async function withTransaction(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getPool, setPool, query, withTransaction, isProd };
