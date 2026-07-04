#!/usr/bin/env bash
# Live admin/invite test (SPEC-004 R2/R3/R5/R6) against a deployed URL.
#
# Usage:
#   BASE_URL=https://wedding-seating-ymzs.onrender.com test/live_admin_test.sh
#
# Always checked (no credentials needed):
#   - unauthenticated GET/POST /api/admin/members -> 401
#
# Full path — requires:
#   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY   org auth instance
#   ADMIN_EMAIL, ADMIN_PASSWORD              test-admin identity; its app_members row
#                                            (role=admin) is created out-of-band
#                                            (render-sql) before running, per plan S4
#   INVITEE_EMAIL, INVITEE_PASSWORD          throwaway invitee identity
# Flow: admin invites INVITEE -> invitee self-signs-up (signup is open) and
# password-grants in -> app access 200 -> admin blocks -> 403 -> admin removes
# row. Then a NON-invited throwaway self-signs-up and must get the 403
# invitation page. Auth-instance identities created here are throwaways and
# are NOT deleted (no privileged key in this script by design).
#
# Wake-aware (3-min retry). Exits non-zero on any failure.
set -u

: "${BASE_URL:?BASE_URL is required, e.g. BASE_URL=https://app.onrender.com}"
BASE_URL="${BASE_URL%/}"

FAIL=0
note() { printf '%s\n' "$*"; }
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then note "ok   $1 -> $3"; else note "FAIL $1 -> got $3, want $2"; FAIL=1; fi
}

# ---- wake the service ----
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

# ---- credential-free: admin routes are gated ----
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE_URL/api/admin/members")
check "unauth GET /api/admin/members" "401" "$code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
  -d '{"email":"nobody@example.com"}' "$BASE_URL/api/admin/members")
check "unauth POST /api/admin/members" "401" "$code"

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_PUBLISHABLE_KEY:-}" ] \
   || [ -z "${ADMIN_EMAIL:-}" ] || [ -z "${ADMIN_PASSWORD:-}" ] \
   || [ -z "${INVITEE_EMAIL:-}" ] || [ -z "${INVITEE_PASSWORD:-}" ]; then
  note "-- full admin path skipped (set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, ADMIN_EMAIL/PASSWORD, INVITEE_EMAIL/PASSWORD) --"
  [ "$FAIL" -ne 0 ] && { note "RESULT: FAIL"; exit 1; }
  note "RESULT: PASS (credential-free path only)"; exit 0
fi

json_field() { sed -n "s/.*\"$1\" *: *\"\([^\"]*\)\".*/\1/p"; }

get_token() { # get_token <email> <password>
  curl -s --max-time 30 \
    -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    "$SUPABASE_URL/auth/v1/token?grant_type=password" | json_field access_token
}

signup() { # signup <email> <password> — 200 new / 4xx already-registered both fine
  curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
    -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    "$SUPABASE_URL/auth/v1/signup"
}

admin_api() { # admin_api <method> <path> [json]
  if [ -n "${3:-}" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "Cookie: sb_at=$ADMIN_AT" \
      -H 'Content-Type: application/json' -d "$3" "$BASE_URL$2"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$1" -H "Cookie: sb_at=$ADMIN_AT" "$BASE_URL$2"
  fi
}

note "-- admin path ($ADMIN_EMAIL) --"
ADMIN_AT=$(get_token "$ADMIN_EMAIL" "$ADMIN_PASSWORD")
if [ -z "$ADMIN_AT" ]; then note "FAIL could not obtain admin access token"; note "RESULT: FAIL"; exit 1; fi
check "admin GET /api/admin/members" "200" "$(admin_api GET /api/admin/members)"

# pre-clean any leftover invitee row from an earlier failed run (result ignored)
admin_api DELETE "/api/admin/members/$INVITEE_EMAIL" >/dev/null || true

note "-- invite -> self-signup -> access (R6) --"
check "admin invites $INVITEE_EMAIL" "201" \
  "$(admin_api POST /api/admin/members "{\"email\":\"$INVITEE_EMAIL\"}")"

sc=$(signup "$INVITEE_EMAIL" "$INVITEE_PASSWORD")
note "info signup $INVITEE_EMAIL -> $sc (200 new / 4xx already-registered both acceptable)"
INVITEE_AT=$(get_token "$INVITEE_EMAIL" "$INVITEE_PASSWORD")
if [ -z "$INVITEE_AT" ]; then
  note "FAIL invitee could not sign in after signup"; FAIL=1
else
  check "invitee GET /api/events" "200" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$INVITEE_AT" "$BASE_URL/api/events")"
  check "invitee GET /" "200" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$INVITEE_AT" "$BASE_URL/")"

  note "-- block -> immediate 403 -> remove --"
  check "admin blocks invitee" "200" \
    "$(admin_api PATCH "/api/admin/members/$INVITEE_EMAIL" '{"status":"blocked"}')"
  check "blocked invitee GET /api/events" "403" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$INVITEE_AT" "$BASE_URL/api/events")"
  check "admin removes invitee row" "200" \
    "$(admin_api DELETE "/api/admin/members/$INVITEE_EMAIL")"
fi

note "-- uninvited self-signup gets the invitation page (R6/R5) --"
STRAY_EMAIL="${STRAY_EMAIL:-stray-$(date +%s)@factory.local}"
STRAY_PASSWORD="stray-$(date +%s)-$RANDOM"
sc=$(signup "$STRAY_EMAIL" "$STRAY_PASSWORD")
note "info signup $STRAY_EMAIL -> $sc"
STRAY_AT=$(get_token "$STRAY_EMAIL" "$STRAY_PASSWORD")
if [ -z "$STRAY_AT" ]; then
  note "FAIL stray identity could not sign in (is signup open on the instance?)"; FAIL=1
else
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$STRAY_AT" "$BASE_URL/")
  check "stray GET / (403 page)" "403" "$code"
  body=$(curl -s -H "Cookie: sb_at=$STRAY_AT" "$BASE_URL/")
  case "$body" in
    *invitation*) note "ok   stray sees the invitation-only page" ;;
    *) note "FAIL stray 403 body missing invitation message"; FAIL=1 ;;
  esac
  check "stray GET /api/events" "403" \
    "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$STRAY_AT" "$BASE_URL/api/events")"
fi

if [ "$FAIL" -ne 0 ]; then note "RESULT: FAIL"; exit 1; fi
note "RESULT: PASS"
