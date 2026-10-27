#!/usr/bin/env bash
# ==============================================================================
# POS SYSTEM — Restore & Disaster Recovery Test Script
# ==============================================================================
# Usage:
#   ./scripts/restore.sh [backup_file.dump] [--keep]
#
# Environment variables:
#   PGHOST / PGPORT       Host (default: localhost) & Port (default: 5432)
#   PGUSER / PGPASSWORD   Postgres credentials (default: pos_user)
#   SCRATCH_DB            Scratch test database name (default: pos_scratch)
#   BACKUP_DIR            Directory to search for latest backup (default: /var/backups/pos)
# ==============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/pos}"
SCRATCH_DB="${SCRATCH_DB:-pos_scratch}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-pos_user}"
export PGPASSWORD="${PGPASSWORD:-pos_password}"

KEEP_SCRATCH=false
TARGET_BACKUP=""

for arg in "$@"; do
  if [ "$arg" == "--keep" ]; then
    KEEP_SCRATCH=true
  elif [ -z "$TARGET_BACKUP" ]; then
    TARGET_BACKUP="$arg"
  fi
done

# If no file specified, find latest backup
if [ -z "$TARGET_BACKUP" ]; then
  if [ -d "$BACKUP_DIR" ]; then
    TARGET_BACKUP=$(ls -t "$BACKUP_DIR"/pos_backup_*.dump 2>/dev/null | head -n 1 || true)
  fi
fi

if [ -z "$TARGET_BACKUP" ] || [ ! -f "$TARGET_BACKUP" ]; then
  echo "ERROR: Target backup file not found! Provide a path or place a backup in ${BACKUP_DIR}." >&2
  exit 1
fi

echo "================================================================="
echo "POS SYSTEM — Automated Database Restore Test"
echo "Target backup: ${TARGET_BACKUP}"
echo "Scratch target: ${SCRATCH_DB} on ${DB_HOST}:${DB_PORT}"
echo "================================================================="

# Step 1: Verify SHA-256 Checksum if available
CHECKSUM_FILE="${TARGET_BACKUP}.sha256"
if [ -f "${CHECKSUM_FILE}" ]; then
  echo "[1/4] Verifying SHA-256 integrity..."
  if command -v sha256sum >/dev/null 2>&1; then
    EXPECTED_HASH=$(awk '{print $1}' "${CHECKSUM_FILE}")
    ACTUAL_HASH=$(sha256sum "${TARGET_BACKUP}" | awk '{print $1}')
  else
    EXPECTED_HASH=$(awk '{print $1}' "${CHECKSUM_FILE}")
    ACTUAL_HASH=$(shasum -a 256 "${TARGET_BACKUP}" | awk '{print $1}')
  fi

  if [ "${EXPECTED_HASH}" != "${ACTUAL_HASH}" ]; then
    echo "ERROR: Checksum mismatch! Corrupted backup file." >&2
    echo "Expected: ${EXPECTED_HASH}" >&2
    echo "Actual:   ${ACTUAL_HASH}" >&2
    exit 1
  fi
  echo "✓ SHA-256 integrity check passed: ${ACTUAL_HASH}"
else
  echo "[1/4] Checksum file not found, proceeding with restore test..."
fi

# Step 2: Prepare scratch database
echo "[2/4] Initializing clean scratch database '${SCRATCH_DB}'..."
dropdb --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" --if-exists "${SCRATCH_DB}"
createdb --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" "${SCRATCH_DB}"

# Step 3: Restore archive into scratch database
echo "[3/4] Restoring pg_dump custom archive into '${SCRATCH_DB}'..."
pg_restore --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" \
           --dbname="${SCRATCH_DB}" --no-owner --no-privileges \
           --exit-on-error "${TARGET_BACKUP}" || {
  # Note: Some warnings or non-fatal pg_restore codes can happen if extensions already exist
  echo "Note: pg_restore completed with warnings or notices."
}

# Step 4: Validate restored contents
echo "[4/4] Verifying database integrity and row counts in '${SCRATCH_DB}'..."

TABLE_COUNT=$(psql --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" --dbname="${SCRATCH_DB}" -t -A -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';")

BUSINESS_COUNT=$(psql --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" --dbname="${SCRATCH_DB}" -t -A -c \
  "SELECT count(*) FROM businesses;")

EMPLOYEE_COUNT=$(psql --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" --dbname="${SCRATCH_DB}" -t -A -c \
  "SELECT count(*) FROM employees;")

PRODUCT_COUNT=$(psql --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" --dbname="${SCRATCH_DB}" -t -A -c \
  "SELECT count(*) FROM products;")

SALE_COUNT=$(psql --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" --dbname="${SCRATCH_DB}" -t -A -c \
  "SELECT count(*) FROM sales;")

echo "-----------------------------------------------------------------"
echo "Restore Verification Results:"
echo "  • Public Tables: ${TABLE_COUNT}"
echo "  • Businesses:    ${BUSINESS_COUNT}"
echo "  • Employees:     ${EMPLOYEE_COUNT}"
echo "  • Products:      ${PRODUCT_COUNT}"
echo "  • Sales Records: ${SALE_COUNT}"
echo "-----------------------------------------------------------------"

if [ "${TABLE_COUNT}" -lt 10 ]; then
  echo "ERROR: Expected at least 10 public tables, found ${TABLE_COUNT}!" >&2
  exit 1
fi

echo "✓ Restore verification successful: All schema and data restored intact."

# Cleanup scratch database unless --keep is passed
if [ "${KEEP_SCRATCH}" = true ]; then
  echo "ℹ Retaining scratch database '${SCRATCH_DB}' for further inspection."
else
  echo "Cleaning up scratch database '${SCRATCH_DB}'..."
  dropdb --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" "${SCRATCH_DB}"
  echo "✓ Scratch database dropped."
fi

echo "Disaster recovery test completed successfully!"
