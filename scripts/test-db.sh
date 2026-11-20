#!/usr/bin/env bash
# Применяет миграции к чистой локальной БД PostgreSQL и запускает SQL-тесты.
# Использование: PGHOST=... PGPORT=... PGUSER=postgres scripts/test-db.sh
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${TEST_DB:-sohtmon_test}"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "drop database if exists $DB" -c "create database $DB"
run() { psql -v ON_ERROR_STOP=1 -q -X -o /dev/null -d "$DB" -f "$1"; }
run supabase/tests/00_supabase_shim.sql
for f in supabase/migrations/*.sql; do echo "→ migration $f"; run "$f"; done
for f in supabase/tests/[1-9]*.sql; do echo "→ test $f"; run "$f"; done
echo "Все SQL-тесты пройдены"
