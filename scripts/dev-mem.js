'use strict';
// LOCAL PREFLIGHT ONLY — runs the real app against an in-process pg-mem
// Postgres so the UI can be smoke-tested without a database. Never used in prod.
const { newDb } = require('pg-mem');
const db = require('../src/db');

const mem = newDb({ noAstCoverageCheck: true });
const pgMem = mem.adapters.createPg();
db.setPool(new pgMem.Pool());

(async () => {
  await require('../src/migrate').run();
  const app = require('../src/app').createApp();
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`[dev-mem] wedding-seating on :${port}`));
})();
