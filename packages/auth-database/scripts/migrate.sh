#!/usr/bin/env bash
#
# migrate.sh — Wrapper script for golang-migrate CLI.
#
# Usage:
#   ./scripts/migrate.sh up        Apply all pending migrations
#   ./scripts/migrate.sh down 1    Roll back 1 migration
#   ./scripts/migrate.sh version   Show current migration version
#   ./scripts/migrate.sh drop -f   Drop all tables (dev only!)
#
# Prerequisites:
#   - golang-migrate CLI binary installed (https://github.com/golang-migrate/migrate)
#   - A .env file in packages/auth-database/ with DATABASE_URL set
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env if it exists
if [ -f "$PACKAGE_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PACKAGE_DIR/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is not set."
  echo "Copy .env.example to .env and set DATABASE_URL, or export it in your shell."
  exit 1
fi

MIGRATIONS_PATH="file://$PACKAGE_DIR/migrations"

exec migrate -path "$PACKAGE_DIR/migrations" -database "$DATABASE_URL" "$@"
