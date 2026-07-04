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
#   ADMIN_EMAIL, ADMIN_PASSWORD              ADMIN-CREATED confirmed identity
#                                            (email_confirm:true, provisioned
#                                            out-of-band); its app_members row
#                                            (role=admin) created via render-sql
#   INVITEE_EMAIL, INVITEE_PASSWORD          ADMIN-CREATED confirmed identity,
#                                            NOT in app_members beforehand
# Optional:
#   NONMEMBER_EMAIL, NONMEMBER_PASSWORD      confirmed identity never invited ->
#                                            asserts the 403 invitation page
#   STRAY_EMAIL, STRAY_PASSWORD              stable throwaway for the public
#                                            signup probe (defaults below)
#
# NOTE on signups: the instance keeps mailer_autoconfirm=false (deliberate —
# prevents preemptive account-takeover by password-claiming someone else's
# email; an unverified password signup can never be confirmed by an attacker).
# So a PUBLIC /auth/v1/signup identity is UNCONFIRMED and password grant must
# FAIL for it. This script asserts that refusal; grantable test identities are
# always admin-created. The stray email is STABLE so reruns don't mint new
# org identities.
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

note "-- invite -> sign-in -> access (R6; invitee identity is admin-created + confirmed) --"
check "admin invites $INVITEE_EMAIL" "201" \
  "$(admin_api POST /api/admin/members "{\"email\":\"$INVITEE_EMAIL\"}")"

INVITEE_AT=$(get_token "$INVITEE_EMAIL" "$INVITEE_PASSWORD")
if [ -z "$INVITEE_AT" ]; then
  note "FAIL invitee could not sign in (identity must be admin-created with email_confirm:true)"; FAIL=1
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

note "-- public signup probe: open, but unconfirmed = ungrantable (anti-takeover) --"
# NOTE: public signup validates deliverability — .local/.test TLDs get 400
# email_address_invalid (admin-created identities are exempt). Use a real-domain
# plus-address the org owner controls; reruns tolerate "already registered".
STRAY_EMAIL="${STRAY_EMAIL:-nbdesai1992+stray-probe@gmail.com}"
STRAY_PASSWORD="${STRAY_PASSWORD:-stray-signup-probe-1}"
sc=$(curl -s -o /dev/null -w '%{http_code}' --max-time 30 \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H 'Content-Type: application/json' \
  -d "{\"email\":\"$STRAY_EMAIL\",\"password\":\"$STRAY_PASSWORD\"}" \
  "$SUPABASE_URL/auth/v1/signup")
case "$sc" in
  200|201) note "ok   public signup accepted ($sc) — signup is open ('already registered' reruns also 200)" ;;
  429) note "ok   public signup rate-limited (429) — endpoint live, abuse protection active; a CLOSED signup returns 400 signup_disabled, so open-ness holds (also verified in instance config)" ;;
  *) note "FAIL public signup -> $sc (expected 200/201, or 429 rate-limit; is signup open?)"; FAIL=1 ;;
esac
# mailer_autoconfirm=false: this identity is unconfirmed, so the grant MUST be
# refused — squatting someone else's email can never yield a usable session.
STRAY_AT=$(get_token "$STRAY_EMAIL" "$STRAY_PASSWORD")
if [ -z "$STRAY_AT" ]; then
  note "ok   password grant refused for unconfirmed signup (anti-takeover holds)"
else
  note "FAIL unconfirmed public signup obtained a token — check mailer_autoconfirm"; FAIL=1
fi

if [ -n "${NONMEMBER_EMAIL:-}" ] && [ -n "${NONMEMBER_PASSWORD:-}" ]; then
  note "-- authenticated non-member sees the invitation page (R5) --"
  NM_AT=$(get_token "$NONMEMBER_EMAIL" "$NONMEMBER_PASSWORD")
  if [ -z "$NM_AT" ]; then
    note "FAIL could not obtain non-member token"; FAIL=1
  else
    code=$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$NM_AT" "$BASE_URL/")
    check "non-member GET / (403 page)" "403" "$code"
    body=$(curl -s -H "Cookie: sb_at=$NM_AT" "$BASE_URL/")
    case "$body" in
      *invitation*) note "ok   non-member sees the invitation-only page" ;;
      *) note "FAIL non-member 403 body missing invitation message"; FAIL=1 ;;
    esac
    check "non-member GET /api/events" "403" \
      "$(curl -s -o /dev/null -w '%{http_code}' -H "Cookie: sb_at=$NM_AT" "$BASE_URL/api/events")"
  fi
else
  note "-- non-member page check skipped (set NONMEMBER_EMAIL, NONMEMBER_PASSWORD) --"
fi

if [ "$FAIL" -ne 0 ]; then note "RESULT: FAIL"; exit 1; fi
note "RESULT: PASS"
