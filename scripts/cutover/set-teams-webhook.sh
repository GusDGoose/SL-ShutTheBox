#!/usr/bin/env bash
# Sets TEAMS_WEBHOOK_URL in Vercel production — but posts a test card FIRST and
# refuses to save a URL that did not work.
#
# Run from the repo root:
#   bash scripts/cutover/set-teams-webhook.sh
#
# The URL is read from a hidden prompt, so it stays out of your shell history
# and out of any transcript. Get it from Teams:
#   the channel → ⋯ → Workflows → "Post to a channel when a webhook request is
#   received" → pick the team and channel → copy the URL it gives you.
#
# PRODUCTION ONLY, on purpose: preview deployments point at the same Supabase
# project, so giving them the webhook too would let a test deploy post real
# cards into the team's channel.
set -euo pipefail

# [concept: never die silently] A script a person runs at a prompt and watches
# must never exit with no output. This one did exactly that for four days: the
# `ls` below lists two candidate paths, only one of which exists on any given
# machine, so it exits 2 even when it FOUND the binary — and `set -e` plus
# `pipefail` turned that into an instant, wordless exit.
trap 'code=$?; if [ $code -ne 0 ]; then
  echo >&2
  echo "set-teams-webhook.sh stopped at line $LINENO (exit $code)." >&2
  echo "Nothing was saved to Vercel." >&2
fi' ERR

cd "$(dirname "$0")/../.."

# npx re-checks the npm registry on every call and hangs on a slow link, so
# prefer the binary it has already cached. .vercel/project.json lives in the
# main checkout, never in a worktree, hence --cwd.
VERCEL_CWD=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
if [ ! -f "$VERCEL_CWD/.vercel/project.json" ]; then
  echo "No .vercel/project.json under $VERCEL_CWD." >&2
  echo "Run 'vercel link' in the main checkout first, or the CLI just prints" >&2
  echo "'Retrieving project...' and returns nothing." >&2
  exit 1
fi
# Each candidate is tested on its own: one `ls` over several globs fails as a
# whole when ANY of them is missing, which is how this used to kill the script
# even after it had found the binary.
CACHED=""
for candidate in   "${NPM_CONFIG_CACHE:-$HOME/.npm}"/_npx/*/node_modules/vercel/dist/index.js   /c/IT/npm-cache/_npx/*/node_modules/vercel/dist/index.js
do
  if [ -f "$candidate" ]; then CACHED="$candidate"; break; fi
done
if command -v vercel >/dev/null 2>&1; then
  vercel_cli() { vercel --cwd "$VERCEL_CWD" "$@"; }
elif [ -n "$CACHED" ]; then
  WIN=$(cygpath -w "$CACHED" 2>/dev/null || echo "$CACHED")
  vercel_cli() { node "$WIN" --cwd "$VERCEL_CWD" "$@"; }
else
  vercel_cli() { npx --yes vercel --cwd "$VERCEL_CWD" "$@"; }
fi

echo "Shut the Box — Teams webhook setup"
echo

# [concept: a hidden prompt is a bad place to receive a paste] This asked for
# the URL with `read -s`, which echoes nothing — so a paste that silently did
# not arrive looked exactly like a paste that arrived malformed, and there was
# no way to tell them apart. Several terminals will not paste into a hidden
# read at all (in Git Bash it is Shift+Insert or right-click, never Ctrl+V).
#
# So there are now four ways in, and the interactive one reports what it got:
#
#   bash set-teams-webhook.sh --file url.txt      <- most reliable
#   TEAMS_WEBHOOK_URL="https://..." bash set-teams-webhook.sh
#   bash set-teams-webhook.sh "https://..."       <- goes in shell history
#   bash set-teams-webhook.sh                     <- prompts

# Strip ANSI and bracketed-paste escapes (ESC[200~ … ESC[201~, which terminals
# wrap pasted text in and `read` stores verbatim), then pull out the first
# https link, which also forgives stray spaces and quotes.
ESC=$(printf '\033')
clean_url() {
  printf '%s' "$1" \
    | sed -e "s/${ESC}\[[0-9;]*[~a-zA-Z]//g" \
    | grep -oE 'https://[^[:space:]"'"'"']+' \
    | head -1 || true
}

URL=""
case "${1:-}" in
  --file)
    SRC="${2:-}"
    [ -n "$SRC" ] || { echo "--file needs a path" >&2; exit 1; }
    [ -f "$SRC" ] || { echo "no such file: $SRC" >&2; exit 1; }
    URL=$(clean_url "$(cat "$SRC")")
    [ -n "$URL" ] || { echo "no https:// link inside $SRC" >&2; exit 1; }
    echo "read the URL from $SRC"
    ;;
  --help|-h)
    sed -n '2,15p' "$0"; exit 0 ;;
  https://*)
    URL=$(clean_url "$1") ;;
  "")
    if [ -n "${TEAMS_WEBHOOK_URL:-}" ]; then
      URL=$(clean_url "$TEAMS_WEBHOOK_URL")
      echo "read the URL from the TEAMS_WEBHOOK_URL environment variable"
    fi
    ;;
  *)
    echo "unrecognised argument: $1 (try --help)" >&2; exit 1 ;;
esac

if [ -z "$URL" ]; then
  printf 'Paste the Teams webhook URL (hidden), then Enter: '
  IFS= read -rs RAW || RAW=""
  printf '\n'
  URL=$(clean_url "${RAW:-}")

  if [ -z "$URL" ]; then
    # Say exactly what turned up. Zero characters means the paste never
    # reached the shell, which is a different problem from a bad link.
    echo "Nothing usable arrived — ${#RAW} characters were read."
    echo "In Git Bash, paste is Shift+Insert or right-click; Ctrl+V does nothing."
    echo "Trying once more with the text VISIBLE so you can see it land."
    echo "(or press Enter to give up and use:  bash $0 --file url.txt)"
    printf 'Webhook URL: '
    IFS= read -r RAW2 || RAW2=""
    URL=$(clean_url "${RAW2:-}")
  fi
fi

if [ -z "$URL" ]; then
  echo "still no https:// link; stopping. Nothing was saved." >&2
  echo "Easiest fallback: put the URL in a file and run" >&2
  echo "  bash $0 --file that-file.txt" >&2
  exit 1
fi

# Microsoft has used several hosts for these over time: logic.azure.com for
# the original Logic Apps triggers, and *.environment.api.powerplatform.com
# for the Power Platform ones Teams hands out now. Both are fine; anything
# else is worth a word, but not worth refusing.
case "$URL" in
  *logic.azure.com*|*azure-apihub.net*|*powerplatform.com*) ;;
  *) echo "note: that host is not one Teams usually gives out — carrying on anyway." ;;
esac
echo "URL looks like a webhook (${#URL} chars)."

# The same envelope src/lib/teams.ts sends: a message with one Adaptive Card
# attachment. A Workflows webhook rejects plain {"text": ...}, so if this card
# renders in the channel, a real winner card will too.
read -r -d '' PAYLOAD <<'JSON' || true
{
  "type": "message",
  "attachments": [
    {
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        "type": "AdaptiveCard",
        "version": "1.4",
        "body": [
          { "type": "TextBlock", "size": "Large", "weight": "Bolder",
            "text": "🎲 Shut the Box is wired up", "wrap": true },
          { "type": "TextBlock",
            "text": "This is a test card. Winner announcements will look like this — name, score, streak, and 📦 when the box goes down.",
            "wrap": true }
        ]
      }
    }
  ]
}
JSON

echo "posting a test card…"
# [concept: never put UTF-8 on a Windows command line] The payload goes in on
# STDIN, not as -d "$PAYLOAD". MinGW curl receives its arguments through the
# Windows ANSI codepage, which turns every emoji into a literal "?" — so the
# card meant to show what real announcements look like arrived reading
# "?? Shut the Box is wired up". Piped bytes are not converted.
#
# curl already writes 000 through -w when it never got a response, so the old
# `|| echo "000"` appended a second one and reported "HTTP 000000".
CODE=$(printf '%s' "$PAYLOAD" | curl -sS -o /tmp/teams-test-response.txt   -w '%{http_code}' -X POST "$URL"   -H "Content-Type: application/json; charset=utf-8"   --data-binary @- || true)

case "$CODE" in
  2*)
    echo "webhook accepted it (HTTP $CODE) — check the channel for the test card."
    ;;
  *)
    echo "webhook did NOT accept it (HTTP $CODE). Nothing has been saved." >&2
    echo "--- response ---" >&2
    head -c 600 /tmp/teams-test-response.txt >&2 || true
    echo >&2
    exit 1
    ;;
esac

printf 'Did the card appear in the channel? [y/N] '
read -r SAW
case "$SAW" in
  y|Y|yes|YES) ;;
  *) echo "not saving, then — the flow accepted the POST but the card never landed, which usually means the flow is off or points at another channel." >&2; exit 1 ;;
esac

echo "saving to Vercel production…"
if printf '%s' "$URL" | vercel_cli env add TEAMS_WEBHOOK_URL production --force; then
  echo "  ok: TEAMS_WEBHOOK_URL"
else
  echo "  FAILED — add it by hand in the Vercel dashboard (Production only)." >&2
  exit 1
fi

echo
echo "It only takes effect on the NEXT deployment. Redeploy with:"
echo "  vercel --cwd $VERCEL_CWD --prod"
echo "or push any commit to main."
echo
echo "Then confirm: curl -sS https://sl-shut-the-box-opal.vercel.app/api/health"
echo "should show \"TEAMS_WEBHOOK_URL_set\": true — and the next crowned game posts a card."
