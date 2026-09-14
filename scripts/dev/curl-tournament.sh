#!/usr/bin/env bash
# Calls every team-play RPC through PostgREST, which is the only way to find out
# whether they work from the app.
#
# pgTAP runs as `postgres`, which cannot even LOAD Supabase's `safeupdate`
# library. The API connection DOES load it, and it refuses any DELETE or UPDATE
# without a WHERE clause (21000). That is how crowning stayed broken in
# production for a day in September 2026 with 226 green tests — see the README
# section "Deploying a schema change".
#
# Usage (local, the default):
#   bash scripts/dev/curl-tournament.sh
#
# Against production, with the service key from the dashboard — never commit it:
#   SUPABASE_URL=https://<ref>.supabase.co SERVICE_KEY=<key> \
#     ACTOR=<a players.id> bash scripts/dev/curl-tournament.sh
#
# It creates an event, plays a team through it, crowns it and DELETES it, so it
# leaves nothing behind.
set -Eeuo pipefail
trap 'echo "FAILED on line $LINENO (exit $?)" >&2' ERR

URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
KEY="${SERVICE_KEY:-}"
if [ -z "$KEY" ]; then
  KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"'"'"'\r')
fi
[ -n "$KEY" ] || { echo "No service key: set SERVICE_KEY or SUPABASE_SERVICE_ROLE_KEY in .env.local" >&2; exit 1; }

# `call <fn> <json>` posts one RPC and fails loudly on a database error.
call() {
  local fn="$1" body="$2" out
  out=$(curl -sS -X POST "$URL/rest/v1/rpc/$fn" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" --data-binary @- <<<"$body")
  if grep -q '"code"' <<<"$out" && grep -q '"message"' <<<"$out"; then
    echo "  $fn REFUSED: $out" >&2
    exit 1
  fi
  echo "$out"
  echo "  ok  $fn" >&2
}

jqv() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],JSON.parse(s));console.log(v??"")})' "$1"; }

ACTOR="${ACTOR:-}"
if [ -z "$ACTOR" ]; then
  ACTOR=$(curl -sS "$URL/rest/v1/players?select=id&is_active=eq.true&limit=1" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | jqv "0.id")
fi
[ -n "$ACTOR" ] || { echo "No active player to act as; seed the database first." >&2; exit 1; }
echo "actor: $ACTOR" >&2

CODE=$(call create_tournament "{\"p_actor\":\"$ACTOR\",\"p_name\":\"curl check\"}" | jqv "tournament.code")
echo "code:  $CODE" >&2

TEAM=$(call tournament_create_team \
  "{\"p_code\":\"$CODE\",\"p_name\":\"Curl FC\",\"p_emoji\":\"🧪\",\"p_song_url\":\"https://youtu.be/dQw4w9WgXcQ\"}" \
  | jqv "created_team_id")

call tournament_update_team \
  "{\"p_code\":\"$CODE\",\"p_team_id\":\"$TEAM\",\"p_name\":\"Curl United\",\"p_emoji\":\"🧪\",\"p_song_url\":null}" >/dev/null
call tournament_add_member "{\"p_code\":\"$CODE\",\"p_team_id\":\"$TEAM\",\"p_name\":\"One\"}" >/dev/null
MEMBERS=$(call tournament_add_member "{\"p_code\":\"$CODE\",\"p_team_id\":\"$TEAM\",\"p_name\":\"Two\"}")
SPARE=$(call tournament_add_member "{\"p_code\":\"$CODE\",\"p_team_id\":\"$TEAM\",\"p_name\":\"Spare\"}" \
  | jqv "teams.0.members.2.id")
call tournament_remove_member \
  "{\"p_code\":\"$CODE\",\"p_team_id\":\"$TEAM\",\"p_member_id\":\"$SPARE\"}" >/dev/null

call tournament_start_team "{\"p_code\":\"$CODE\",\"p_team_id\":\"$TEAM\"}" >/dev/null
call tournament_set_board "{\"p_code\":\"$CODE\",\"p_team_id\":\"$TEAM\",\"p_tiles_down\":[1,2,3]}" >/dev/null
FIRST=$(call tournament_end_turn "{\"p_code\":\"$CODE\",\"p_team_id\":\"$TEAM\"}" | jqv "teams.0.members.0.id")
call tournament_end_turn "{\"p_code\":\"$CODE\",\"p_team_id\":\"$TEAM\",\"p_typed_score\":40}" >/dev/null
call tournament_correct_member \
  "{\"p_code\":\"$CODE\",\"p_team_id\":\"$TEAM\",\"p_member_id\":\"$FIRST\",\"p_score\":30}" >/dev/null

# A second team, created and thrown away, so the delete path is exercised too.
SPARE_TEAM=$(call tournament_create_team "{\"p_code\":\"$CODE\",\"p_name\":\"Scratch\"}" | jqv "created_team_id")
call tournament_delete_team "{\"p_code\":\"$CODE\",\"p_team_id\":\"$SPARE_TEAM\"}" >/dev/null

call tournament_snapshot_by_code "{\"p_code\":\"$CODE\"}" >/dev/null
AVG=$(call finish_tournament "{\"p_actor\":\"$ACTOR\",\"p_code\":\"$CODE\"}" | jqv "teams.0.average")
echo "  team average after the correction: $AVG (expected 35)" >&2

call delete_tournament "{\"p_actor\":\"$ACTOR\",\"p_code\":\"$CODE\"}" >/dev/null

echo >&2
echo "All team-play RPCs answered through PostgREST, and the event was cleaned up." >&2
