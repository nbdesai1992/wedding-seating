// Org-login gate (factory-auth recipe): PKCE login against the org Supabase
// auth instance, local JWT verification via JWKS (ES256, no network per
// request), one refresh attempt, then an active-membership check against THIS
// app's own app_members table. Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY,
// APP_URL — read lazily so the module loads in tests without them.
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { createRemoteJWKSet, jwtVerify } = require('jose');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const b64url = (b) => b.toString('base64url');

let jwks = null;
function getJwks() {
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(`${process.env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  }
  return jwks;
}

// secure cookies only when the app itself is served over https, so local
// (http://localhost) preflight still round-trips cookies.
function cookieOpts(extra) {
  return {
    httpOnly: true,
    secure: (process.env.APP_URL || '').startsWith('https://'),
    sameSite: 'lax',
    ...extra,
  };
}

// Test hook: only ever honored under NODE_ENV=test. Identity comes from the
// x-test-email header; the app_members check below still applies.
function bypassActive() {
  return process.env.NODE_ENV === 'test' && process.env.AUTH_BYPASS === '1';
}

function setSessionCookies(res, tokens) {
  // maxAge keeps the session across browser restarts: access token 1h
  // (refreshed as needed), refresh token 30d.
  res.cookie('sb_at', tokens.access_token, cookieOpts({ maxAge: 60 * 60 * 1000 }));
  res.cookie('sb_rt', tokens.refresh_token, cookieOpts({ maxAge: 30 * 24 * 60 * 60 * 1000 }));
}

// Static-asset requests (anything with a non-.html file extension, e.g.
// /app.js) never trigger a refresh-token grant: a cold page load fires them
// in parallel and N simultaneous refreshes would race token rotation.
// Only the document/API request refreshes; assets retry with the new cookie.
function isStaticAssetPath(p) {
  const ext = path.extname(p);
  return ext !== '' && ext !== '.html';
}

// ---- routes: login page, PKCE start, callback, logout ----
function routes(app) {
  // GET /login serves the styled page; the button on it POSTs to /login,
  // which starts the PKCE flow (redirect to the org Google authorize URL).
  app.get('/login', (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, 'login.html'));
  });

  app.post('/login', (req, res) => {
    const verifier = b64url(crypto.randomBytes(32));
    const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
    res.cookie('pkce_v', verifier, cookieOpts({ maxAge: 600_000 }));
    const u = new URL(`${process.env.SUPABASE_URL}/auth/v1/authorize`);
    u.search = new URLSearchParams({
      provider: 'google',
      redirect_to: `${process.env.APP_URL}/auth/callback`,
      code_challenge: challenge,
      code_challenge_method: 's256',
    });
    res.redirect(u.toString());
  });

  app.get('/auth/callback', async (req, res) => {
    // Provider error or missing code (e.g. user cancelled at Google, or the
    // hosted-auth screen rejected the account) → back to login with a gentle
    // notice, never a 500 or a silent bounce.
    if (req.query.error || !req.query.code) return res.redirect('/login?err=invite');
    try {
      const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
        method: 'POST',
        headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ auth_code: req.query.code, code_verifier: req.cookies.pkce_v }),
      });
      if (!r.ok) return res.redirect('/login');
      const t = await r.json();
      res.clearCookie('pkce_v');
      setSessionCookies(res, t);
      res.redirect('/');
    } catch (err) {
      console.error('auth callback failed:', err);
      res.redirect('/login');
    }
  });

  app.post('/logout', (req, res) => {
    res.clearCookie('sb_at');
    res.clearCookie('sb_rt');
    res.redirect('/login');
  });
}

// ---- responses ----
function unauthorized(req, res) {
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'unauthorized' });
  return res.redirect('/login');
}

let invitedOnlyTemplate = null;
function forbidden(req, res, email) {
  if (req.path.startsWith('/api/')) return res.status(403).json({ error: 'forbidden' });
  if (invitedOnlyTemplate === null) {
    invitedOnlyTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'invited-only.html'), 'utf8');
  }
  const safe = String(email || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return res.status(403).type('html').send(invitedOnlyTemplate.replace(/{{EMAIL}}/g, safe));
}

// ---- requireMember: valid org login AND active member of THIS app ----
function requireMember(db) {
  return async (req, res, next) => {
    try {
      let email;
      if (bypassActive()) {
        email = String(req.headers['x-test-email'] || '').trim().toLowerCase();
        if (!email) return unauthorized(req, res);
      } else {
        let payload;
        try {
          ({ payload } = await jwtVerify(req.cookies.sb_at, getJwks()));
        } catch {
          // expired/missing access token → one refresh attempt, but only for
          // document/API requests — parallel static-asset requests must not
          // race refresh-token rotation on a cold page load.
          if (isStaticAssetPath(req.path)) return unauthorized(req, res);
          if (!req.cookies.sb_rt) return unauthorized(req, res);
          const r = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
            method: 'POST',
            headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: req.cookies.sb_rt }),
          });
          if (!r.ok) return unauthorized(req, res);
          const t = await r.json();
          setSessionCookies(res, t);
          ({ payload } = await jwtVerify(t.access_token, getJwks()));
        }
        email = String(payload.email || '').toLowerCase();
        if (!email) return unauthorized(req, res);
      }

      const m = await db.query(
        "SELECT 1 FROM app_members WHERE email = $1 AND status = 'active'", [email]);
      if (m.rows.length === 0) return forbidden(req, res, email);
      req.user = { email };
      next();
    } catch (err) {
      // verification / refresh errors are auth failures, not 500s
      unauthorized(req, res);
    }
  };
}

module.exports = { routes, requireMember };
