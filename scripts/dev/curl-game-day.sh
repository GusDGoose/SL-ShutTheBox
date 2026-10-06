#!/usr/bin/env bash
# Calls the game RPCs that 0023 changed through PostgREST, which is the only
# way to find out whether they work from the app.
#
# pgTAP runs as `postgres`, which cannot even LOAD Supabase's `safeupdate`
# library. The API connection DOES load it, and it refuses any DELETE or UPDATE
# without a WHERE clause (21000) — see the README section "Deploying a schema
# change".
#
# What it checks: a shut box does not end the game; a correction with nobody
# skipped leaves the turn alone; an edit keeps a shut box's empty board; and
# one counted game a day — STB14 while today's game is live, STB13 once it is
# crowned, and the same for recording, moving, restoring and undoing — with
# the refusal naming the game that holds the day.
#
# LOCAL ONLY. It plays a game today and adds a few in 2019, then hard-deletes
# them and rebuilds ratings and badges, so it leaves nothing behind. It refuses
# to run while today already has a game, rather than disturbing it.
#
#   bash scripts/dev/curl-game-day.sh
set -Eeuo pipefail
trap 'echo "FAILED on line $LINENO (exit $?)" >&2' ERR

URL="http://127.0.0.1:54321"
KEY=$(grep -E '^SUPABASE_SERVICE_ROLE_KEY=' .env.local | cut -d= -f2- | tr -d '"'"'"'\r')
[ -n "$KEY" ] || { echo "No SUPABASE_SERVICE_ROLE_KEY in .env.local" >&2; exit 1; }
H=(-H "apikey: $KEY" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json")

# `call <fn> <json>` posts one RPC and fails loudly on a database error.
call() {
  local fn="$1" body="$2" out
  out=$(curl -sS -X POST "$URL/rest/v1/rpc/$fn" "${H[@]}" --data-binary @- <<<"$body")
  if grep -q '"code"' <<<"$out" && grep -q '"message"' <<<"$out"; then
    echo "  $fn REFUSED: $out" >&2
    exit 1
  fi
  echo "$out"
  echo "  ok  $fn" >&2
}

# `refused <code> <fn> <json> <why>` posts one RPC that MUST be refused with
# exactly that SQLSTATE.
refused() {
  local want="$1" fn="$2" body="$3" why="$4" out
  out=$(curl -sS -X POST "$URL/rest/v1/rpc/$fn" "${H[@]}" --data-binary @- <<<"$body")
  if ! grep -q "\"code\":\"$want\"" <<<"$out"; then
    echo "  $fn should have been refused with $want ($why), got: $out" >&2
    exit 1
  fi
  echo "$out"
  echo "  ok  $fn refused with $want — $why" >&2
}

get() { curl -sS "$URL/rest/v1/$1" "${H[@]}"; }

jqv() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const v=process.argv[1].split(".").reduce((o,k)=>o?.[k],JSON.parse(s));console.log(typeof v==="object"&&v!==null?JSON.stringify(v):v??"")})' "$1"; }

expect() {
  local what="$1" have="$2" want="$3"
  if [ "$have" != "$want" ]; then
    echo "  $what: wanted $want, got $have" >&2
    exit 1
  fi
  echo "  ok  $what" >&2
}

PLAYERS=$(get "players?select=id&is_active=eq.true&order=created_at&limit=3")
A=$(jqv "0.id" <<<"$PLAYERS"); B=$(jqv "1.id" <<<"$PLAYERS"); C=$(jqv "2.id" <<<"$PLAYERS")
[ -n "$C" ] || { echo "Needs three active players; seed the database first." >&2; exit 1; }

TODAY=$(call stockholm_today '{}' | tr -d '"')
if [ "$(get "games?select=id&played_on=eq.$TODAY&status=neq.abandoned&deleted_at=is.null")" != "[]" ]; then
  echo "Today ($TODAY) already has a game here; not touching it." >&2
  exit 1
fi

GAMES=()
cleanup() {
  for g in "${GAMES[@]}"; do
    curl -sS -X DELETE "$URL/rest/v1/games?id=eq.$g" "${H[@]}" >/dev/null
  done
  curl -sS -X POST "$URL/rest/v1/rpc/resettle_history" "${H[@]}" -d '{}' >/dev/null
  echo "  cleaned up ${#GAMES[@]} game(s)" >&2
}
trap cleanup EXIT

echo "-- a shut box does not end the game" >&2
G=$(call start_game "{\"p_actor\":\"$A\",\"p_player_ids\":[\"$A\",\"$B\",\"$C\"]}" | jqv "game.id")
GAMES+=("$G")
call live_set_board "{\"p_actor\":\"$A\",\"p_game_id\":\"$G\",\"p_tiles_down\":[1,2,3,4,5,6,7,8,9,10,11,12]}" >/dev/null
UP=$(call end_turn "{\"p_actor\":\"$A\",\"p_game_id\":\"$G\"}" | jqv "turn.player_id")
expect "the next player is up after a shut box" "$UP" "$B"

UP=$(call set_turn_result "{\"p_actor\":\"$A\",\"p_game_id\":\"$G\",\"p_player_id\":\"$A\",\"p_tiles_open\":[7],\"p_score\":7}" | jqv "turn.player_id")
expect "a correction with nobody skipped leaves the turn where it was" "$UP" "$B"
expect "one player up at a time" \
  "$(get "game_players?select=player_id&game_id=eq.$G&status=eq.playing" | jqv "length")" "1"

echo "-- one counted game a day" >&2
LIVE=$(refused STB14 start_game "{\"p_actor\":\"$B\",\"p_player_ids\":[\"$B\",\"$C\"]}" \
  "another game cannot start while one is live today" | jqv "details")
expect "the refusal names the live game" "$LIVE" "$G"

call end_turn "{\"p_actor\":\"$A\",\"p_game_id\":\"$G\",\"p_typed_score\":30}" >/dev/null
call end_turn "{\"p_actor\":\"$A\",\"p_game_id\":\"$G\",\"p_typed_score\":20}" >/dev/null
call finish_game "{\"p_actor\":\"$A\",\"p_game_id\":\"$G\"}" >/dev/null

DAY=$(refused STB13 start_game "{\"p_actor\":\"$B\",\"p_player_ids\":[\"$B\",\"$C\"]}" \
  "today already has its game" | jqv "details")
expect "the refusal names the day's game" "$DAY" "$G"
refused STB13 add_manual_game "{\"p_actor\":\"$B\",\"p_played_on\":\"$TODAY\",\"p_results\":[{\"player_id\":\"$B\",\"status\":\"done\",\"score\":9}]}" \
  "nor is a second one recorded for today" >/dev/null

echo "-- an edit keeps a shut box's empty board" >&2
M=$(call add_manual_game "{\"p_actor\":\"$A\",\"p_played_on\":\"2019-03-04\",\"p_results\":[{\"player_id\":\"$A\",\"status\":\"done\",\"score\":0,\"tiles_open\":[]},{\"player_id\":\"$B\",\"status\":\"done\",\"score\":12,\"tiles_open\":[5,7]}]}" | tr -d '"')
GAMES+=("$M")
expect "a manual shut box keeps its empty board" \
  "$(get "game_players?select=tiles_open&game_id=eq.$M&player_id=eq.$A" | jqv "0.tiles_open")" "[]"
call edit_game "{\"p_actor\":\"$A\",\"p_game_id\":\"$M\",\"p_played_on\":\"2019-03-04\",\"p_results\":[{\"player_id\":\"$A\",\"status\":\"done\",\"score\":0,\"tiles_open\":[]},{\"player_id\":\"$B\",\"status\":\"done\",\"score\":12,\"tiles_open\":[5,7]}],\"p_note\":\"curl\"}" >/dev/null
expect "and so does an edit" \
  "$(get "game_players?select=tiles_open&game_id=eq.$M&player_id=eq.$A" | jqv "0.tiles_open")" "[]"

echo "-- corrections respect the day's game" >&2
ONE="[{\"player_id\":\"$A\",\"status\":\"done\",\"score\":9}]"
M2=$(call add_manual_game "{\"p_actor\":\"$A\",\"p_played_on\":\"2019-03-05\",\"p_results\":$ONE}" | tr -d '"')
GAMES+=("$M2")
refused STB13 edit_game "{\"p_actor\":\"$A\",\"p_game_id\":\"$M2\",\"p_played_on\":\"2019-03-04\",\"p_results\":$ONE}" \
  "a game is not moved onto a day that has its game" >/dev/null
call edit_game "{\"p_actor\":\"$A\",\"p_game_id\":\"$M2\",\"p_played_on\":\"2019-03-05\",\"p_results\":$ONE,\"p_note\":\"in place\"}" >/dev/null

call delete_game "{\"p_actor\":\"$A\",\"p_game_id\":\"$M\",\"p_reason\":\"curl\"}" >/dev/null
M3=$(call add_manual_game "{\"p_actor\":\"$A\",\"p_played_on\":\"2019-03-04\",\"p_results\":$ONE}" | tr -d '"')
GAMES+=("$M3")
refused STB13 restore_game "{\"p_actor\":\"$A\",\"p_game_id\":\"$M\"}" \
  "a deleted game does not come back over its replacement" >/dev/null
UNDO=$(get "audit_log?select=id&entity_id=eq.$M&order=id.desc&limit=1" | jqv "0.id")
refused STB13 undo_game_change "{\"p_actor\":\"$A\",\"p_audit_id\":$UNDO}" \
  "nor does undoing its delete bring it back" >/dev/null

echo "All game-day RPCs behave through PostgREST." >&2
