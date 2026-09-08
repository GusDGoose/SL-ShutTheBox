#!/usr/bin/env bash
# Regenerates cutover_A_consolidated.sql from supabase/migrations/.
#
# Why this exists: the Postgres ports are firewalled on the office network, so
# `supabase db push` cannot reach the database and the dashboard SQL editor
# (HTTPS) is the only way in. This bundles the pending migrations into one
# transaction and adds the migration-history rows the CLI would have written.
#
# Run from the repo root:  bash scripts/cutover/build-consolidated.sh
set -euo pipefail

cd "$(dirname "$0")/../.."

PENDING=(0004 0005 0006 0007 0008 0009 0010 0011 0012 0013 0014)
OUT="scripts/cutover/cutover_A_consolidated.sql"

# Anything that cannot run inside a transaction would silently break the
# all-or-nothing guarantee the header promises.
if grep -rin "concurrently\|alter system\|create database" \
     supabase/migrations/ >/dev/null; then
  echo "refusing: a migration contains a statement that cannot run in a transaction" >&2
  exit 1
fi

{
  cat scripts/cutover/consolidated-header.sql

  for v in "${PENDING[@]}"; do
    f=$(ls supabase/migrations/"${v}"_*.sql)
    printf '\n\n-- ======================= %s =======================\n\n' \
      "$(basename "$f")"
    cat "$f"
  done

  cat scripts/cutover/consolidated-footer.sql
} > "$OUT"

echo "wrote $OUT ($(wc -c < "$OUT") bytes)"
