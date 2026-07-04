#!/usr/bin/env bash
# Live auth-gate test (SPEC-003 R1/R2/R3/R6) against a deployed URL.
#
# Usage:
#   BASE_URL=https://wedding-seating-ymzs.onrender.com test/live_auth_test.sh
#
# Always checked (no credentials needed):
#   - unauthenticated GET /            -> 302 to /login
#   - unauthenticated GET /api/events  -> 401
#
# With SUPABASE_URL + SUPABASE_PUBLISHABLE_KEY + TEST_EMAIL + TEST_PASSWORD
# (a test member created via the factory-auth admin technique, present in
# app_members): password-grant token as the sb_at cookie -> /api/events 200.
# With NONMEMBER_EMAIL + NONMEMBER_PASSWORD (identity NOT in app_members):
# same flow -> 403.
#
# Wake-aware: retries the first request for up to 3 minutes (free-tier spin-up).
# Exits non-zero on any failure.
set -u

: "${BASE_URL:?BASE_URL is required, e.g. BASE_URL=https://app.onrender.com}"
BASE_URL="${BASE_URL%/}"

FAIL=0
note() { printf '%s\n' "$*"; }
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then note "ok   $1 -> $3"; else note "FAIL $1 -> got $3, want $2"; FAIL=1; fi
}

# ---- wake the service: retry up to 3 minutes for a first response ----
note "waking $BASE_URL (up to 180s) ..."
deadline=$(( $(date +%s) + 180 ))
while :; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 "$BASE_URL/healthz" || true)
  [ "$code" = "200" ] && { note "ok   /healthz -> 200"; break; }
  if [ "$(date +%s)" -ge "$deadline" ]; then
    note "FAIL service did not wake within 180s (last /healthz -> $code)"; exit 1
  fi
  sleep 5
done

# ---- unauthenticated matrix (R1) ----
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/")
check "unauth GET /" "302" "$code"
loc=$(curl -s -o /dev/null -w '%{redirect_url}' "$BASE_URL/")
case "$loc" in
  */login) note "ok   redirect target -> $loc" ;;
  *) note "FAIL redirect target -> '$loc' (want */login)"; FAIL=1 ;;
esac
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/events")
check "unauth GET /api/events" "401" "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/login")
check "GET /login page" "200" "$code"

# ---- token helper: password grant against the org auth instance ----
get_token() { # get_token <email> <password> -> prints access_token or empty
  curl -s --max-time 30 \
    -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    "$SUPABASE_URL/auth/v1/token?grant_type=password" |
    sed -n 's/.*"access_token" *: *"\([^"]*\)".*/\1/p'
}

if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_PUBLISHABLE_KEY:-}" ] \
   && [ -n "${TEST_EMAIL:-}" ] && [ -n "${TEST_PASSWORD:-}" ]; then
  note "-- member path (password grant for $TEST_EMAIL) --"
  AT=$(get_token "$TEST_EMAIL" "$TEST_PASSWORD")
  if [ -z "$AT" ]; then
    note "FAIL could not obtain access token for TEST_EMAIL"; FAIL=1
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$AT" "$BASE_URL/api/events")
    check "member GET /api/events" "200" "$code"
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$AT" "$BASE_URL/")
    check "member GET /" "200" "$code"
  fi
else
  note "-- member path skipped (set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_EMAIL, TEST_PASSWORD) --"
fi

if [ -n "${SUPABASE_URL:-}" ] && [ -n "${SUPABASE_PUBLISHABLE_KEY:-}" ] \
   && [ -n "${NONMEMBER_EMAIL:-}" ] && [ -n "${NONMEMBER_PASSWORD:-}" ]; then
  note "-- non-member path (password grant for $NONMEMBER_EMAIL) --"
  AT=$(get_token "$NONMEMBER_EMAIL" "$NONMEMBER_PASSWORD")
  if [ -z "$AT" ]; then
    note "FAIL could not obtain access token for NONMEMBER_EMAIL"; FAIL=1
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$AT" "$BASE_URL/api/events")
    check "non-member GET /api/events" "403" "$code"
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$AT" "$BASE_URL/")
    check "non-member GET / (invitation page)" "403" "$code"
  fi
else
  note "-- non-member path skipped (set NONMEMBER_EMAIL, NONMEMBER_PASSWORD) --"
fi

if [ "$FAIL" -ne 0 ]; then note "RESULT: FAIL"; exit 1; fi
note "RESULT: PASS"
