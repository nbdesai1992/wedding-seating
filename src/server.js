'use strict';

const { createApp } = require('./app');
const { run: migrate } = require('./migrate');

const port = process.env.PORT || 3000;

// The auth gate is useless without its config — refuse to boot rather than
// serve a broken gate (on exit 1 Render fails the deploy and keeps the
// previous version live).
if (process.env.NODE_ENV !== 'test') {
  const missing = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'APP_URL']
    .filter((k) => !(process.env[k] || '').trim());
  if (missing.length > 0) {
    console.error(`missing required auth env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

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
