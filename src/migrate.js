// Numbered-SQL migration runner. Applies any migrations/*.sql not yet recorded
// in schema_migrations, in filename order, each inside a transaction. Idempotent.
'use strict';

const fs = require('fs');
const path = require('path');
const db = require('./db');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function ensureMigrationsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedVersions() {
  const { rows } = await db.query('SELECT version FROM schema_migrations');
  return new Set(rows.map((r) => r.version));
}

async function run() {
  await ensureMigrationsTable();
  const applied = await appliedVersions();

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    await db.withTransaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version) VALUES ($1)', [file]);
    });
    console.log(`applied migration ${file}`);
    count += 1;
  }
  if (count === 0) console.log('no pending migrations');
  else console.log(`applied ${count} migration(s)`);
}

// Run when invoked directly (pre-deploy). Exported for tests.
if (require.main === module) {
  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('migration failed:', err);
      process.exit(1);
    });
}

module.exports = { run };
