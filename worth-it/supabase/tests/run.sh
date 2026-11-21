#!/usr/bin/env bash
# Runs the migrations + policy tests against a THROWAWAY plain-Postgres database (not your Supabase project).
# Usage: PGHOST=localhost PGPORT=5432 PGUSER=postgres ./supabase/tests/run.sh
set -uo pipefail
cd "$(dirname "$0")/.."
DB=worthit_test_$$
psql -qd postgres -c "create database $DB" >/dev/null || exit 1
trap 'psql -qd postgres -c "drop database $DB" >/dev/null' EXIT
for f in tests/00_supabase_stubs.sql migrations/*.sql tests/[1-9]*_test.sql; do
  if ! out=$(psql -qd "$DB" -v ON_ERROR_STOP=1 -f "$f" 2>&1); then
    printf '%s\n' "$out"; echo "FAILED in $f"; exit 1
  fi
  printf '%s\n' "$out" | sed -E 's/^psql:[^ ]+ NOTICE:  /  /' | grep -v '^$' || true
done
