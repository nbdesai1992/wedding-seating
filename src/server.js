'use strict';

const { createApp } = require('./app');
const { run: migrate } = require('./migrate');

const port = process.env.PORT || 3000;

// Apply pending migrations before serving. Same numbered-SQL runner used in the
// pre-deploy hook; idempotent (schema_migrations guards already-applied files).
// Free-tier Render services don't support a pre-deploy command, so we migrate here.
(async () => {
  try {
    await migrate();
  } catch (err) {
    console.error('startup migration failed:', err);
    process.exit(1);
  }
  const app = createApp();
  app.listen(port, () => console.log(`wedding-seating listening on :${port}`));
})();
