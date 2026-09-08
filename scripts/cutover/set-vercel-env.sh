#!/usr/bin/env bash
# Adds the four environment variables v2 needs to Vercel production.
#
# Run from the repo root, once, BEFORE deploying:
#   bash scripts/cutover/set-vercel-env.sh
#
# The two secrets are generated here and piped straight into Vercel, so they
# never appear on screen or in a shell history. The publishable key is read
# from the Supabase Management API (HTTPS, so it works even from the office
# network); it is designed to be public — it acts as the `anon` role, which
# every table denies through RLS, and the only thing it may do is subscribe to
# live-board broadcasts. Never put the service_role/secret key here.
#
# Both CLIs must already be authenticated (`supabase login`, `vercel login`).
set -euo pipefail

PROJECT_REF="dgbifxudsueyppqqpglz"   # SL-ShutTheBox, eu-west-1

# ---------------------------------------------------------------------------
# Resolving the CLIs
#
# `npx <tool>` asks the npm registry to resolve a version on every run. On a
# phone hotspot that hangs for minutes, and because this script pipes secrets
# into stdin, an npx "Ok to proceed?" prompt silently EATS the secret and then
# waits forever. So: prefer whatever is on PATH, then the package npx has
# already cached, and only fall back to npx itself.
# ---------------------------------------------------------------------------
resolve_cli() {
  local tool="$1" cached
  if command -v "$tool" >/dev/null 2>&1; then
    echo "$tool"; return
  fi
  cached=$(ls -d "${NPM_CONFIG_CACHE:-$HOME/.npm}"/_npx/*/node_modules/"$tool"/dist/index.js \
                 /c/IT/npm-cache/_npx/*/node_modules/"$tool"/dist/index.js 2>/dev/null | head -1)
  if [ -n "$cached" ]; then
    # node needs a Windows-style path; MinGW's /c/... will not resolve.
    echo "node|$(cygpath -w "$cached" 2>/dev/null || echo "$cached")"; return
  fi
  echo "npx|--yes|$tool"
}

# Runs a resolved CLI, whose parts are separated by "|".
run_cli() {
  local spec="$1"; shift
  local IFS='|'; local -a parts=($spec); unset IFS
  "${parts[@]}" "$@"
}

VERCEL=$(resolve_cli vercel)
SUPABASE=$(resolve_cli supabase)

# `.vercel/project.json` lives in the main checkout, not in a git worktree, and
# without it the CLI cannot tell which project it is talking to — it prints
# "Retrieving project…" and returns nothing. In a worktree, --git-common-dir
# points at the main repo's .git, so its parent is the checkout we want.
VERCEL_CWD=$(dirname "$(git rev-parse --path-format=absolute --git-common-dir)")
if [ ! -f "$VERCEL_CWD/.vercel/project.json" ]; then
  echo "no .vercel/project.json under $VERCEL_CWD — run 'vercel link' there first" >&2
  exit 1
fi

echo "vercel:   ${VERCEL//|/ }  (--cwd $VERCEL_CWD)"
echo "supabase: ${SUPABASE//|/ }"
echo

# Parsed with node rather than python3: node is already needed below for the
# secrets, so leaning on a second runtime is one more thing to be missing.
# The CLI prints a log line before its JSON, hence the slice to the first
# bracket rather than parsing the whole stream.
PUB=$(run_cli "$SUPABASE" projects api-keys --project-ref "$PROJECT_REF" -o json \
  | node -e "
let raw = '';
process.stdin.on('data', d => raw += d).on('end', () => {
  const start = raw.search(/[\[{]/);
  const data = JSON.parse(raw.slice(start));
  const keys = Array.isArray(data) ? data : (data.keys ?? data);
  const key = keys
    .map(k => k.api_key ?? k.value ?? '')
    .find(v => String(v).startsWith('sb_publishable_'));
  if (key) process.stdout.write(key);
});
")

if [ -z "$PUB" ]; then
  echo "could not read the publishable key — is 'supabase login' still valid?" >&2
  exit 1
fi
echo "publishable key: ${#PUB} chars"

# 32 random bytes each. SESSION_SECRET signs the PIN and identity cookies —
# changing it later signs every device out, which is also how you revoke them
# all at once. CRON_SECRET is the bearer token Vercel sends to /api/cron/*.
SESSION=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
CRON=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

add() {
  local name="$1" value="$2"
  echo
  echo "--- $name"
  # Output is NOT swallowed on purpose. An earlier version hid it, and when the
  # CLI asked something the script looked hung with no prompt on screen — the
  # worst place to guess, since a typed answer becomes the value.
  # --force replaces an existing variable, so re-running this is safe.
  if printf '%s' "$value" | run_cli "$VERCEL" --cwd "$VERCEL_CWD" env add "$name" production --force; then
    echo "  ok: $name"
  else
    echo "  FAILED: $name — set it by hand in the Vercel dashboard"
  fi
}

echo "adding to Vercel production (values are piped in, nothing to type):"
add SESSION_SECRET                       "$SESSION"
add CRON_SECRET                          "$CRON"
add NEXT_PUBLIC_SUPABASE_URL             "https://${PROJECT_REF}.supabase.co"
add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "$PUB"

echo
echo "current production variables:"
run_cli "$VERCEL" --cwd "$VERCEL_CWD" env ls production
echo
echo "Env var changes only take effect on the NEXT deployment."
