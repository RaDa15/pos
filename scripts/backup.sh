#!/usr/bin/env bash
# ==============================================================================
# POS SYSTEM — Nightly Automated PostgreSQL Backup Script
# ==============================================================================
# Usage:
#   ./scripts/backup.sh
#
# Environment variables:
#   DATABASE_URL          Full PostgreSQL connection string (takes precedence)
#   PGHOST / PGPORT       Host (default: localhost) & Port (default: 5432)
#   PGUSER / PGPASSWORD   Postgres credentials (default: pos_user)
#   PGDATABASE            Database name (default: pos_db)
#   BACKUP_DIR            Directory to store backups (default: /var/backups/pos)
#   RETENTION_DAYS        Days to retain local backups (default: 30)
#   S3_BUCKET             Optional S3 bucket for off-server copy (e.g., s3://pos-backups-prod)
#   OFFSERVER_SYNC_CMD    Optional custom off-server command (e.g., rsync, rclone)
# ==============================================================================

set -euo pipefail

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pos}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DB_NAME="${PGDATABASE:-pos_db}"
DB_HOST="${PGHOST:-localhost}"
DB_PORT="${PGPORT:-5432}"
DB_USER="${PGUSER:-pos_user}"

mkdir -p "${BACKUP_DIR}"

BACKUP_FILENAME="pos_backup_${TIMESTAMP}.dump"
BACKUP_PATH="${BACKUP_DIR}/${BACKUP_FILENAME}"
CHECKSUM_PATH="${BACKUP_PATH}.sha256"
LOG_PREFIX="[$(date +"%Y-%m-%dT%H:%M:%S%z")] [POS-BACKUP]"

echo "${LOG_PREFIX} Starting database backup for database '${DB_NAME}'..."

# Execute pg_dump with custom compressed archive format (-Fc)
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump --format=custom --compress=9 --no-owner --no-privileges "${DATABASE_URL}" > "${BACKUP_PATH}"
else
  export PGPASSWORD="${PGPASSWORD:-pos_password}"
  pg_dump --host="${DB_HOST}" --port="${DB_PORT}" --username="${DB_USER}" \
          --format=custom --compress=9 --no-owner --no-privileges "${DB_NAME}" > "${BACKUP_PATH}"
fi

# Verify backup was created and has non-zero size
if [ ! -s "${BACKUP_PATH}" ]; then
  echo "${LOG_PREFIX} ERROR: Backup file ${BACKUP_PATH} is missing or empty!" >&2
  exit 1
fi

BACKUP_SIZE=$(du -h "${BACKUP_PATH}" | cut -f1)
echo "${LOG_PREFIX} Dump created successfully: ${BACKUP_FILENAME} (${BACKUP_SIZE})"

# Compute SHA-256 Checksum for integrity verification
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${BACKUP_PATH}" > "${CHECKSUM_PATH}"
elif command -v shasum >/dev/null 2>&1; then
  shasum -a 256 "${BACKUP_PATH}" > "${CHECKSUM_PATH}"
else
  echo "${LOG_PREFIX} WARNING: Neither sha256sum nor shasum found. Skipping checksum file."
fi

if [ -f "${CHECKSUM_PATH}" ]; then
  echo "${LOG_PREFIX} SHA-256 checksum saved to ${CHECKSUM_PATH}"
fi

# Off-server sync (S3 / R2 / Cloud Storage)
if [ -n "${S3_BUCKET:-}" ]; then
  if command -v aws >/dev/null 2>&1; then
    echo "${LOG_PREFIX} Syncing backup to remote S3 bucket: ${S3_BUCKET}..."
    aws s3 cp "${BACKUP_PATH}" "${S3_BUCKET}/${BACKUP_FILENAME}" --sse AES256
    if [ -f "${CHECKSUM_PATH}" ]; then
      aws s3 cp "${CHECKSUM_PATH}" "${S3_BUCKET}/${BACKUP_FILENAME}.sha256" --sse AES256
    fi
    echo "${LOG_PREFIX} Off-server S3 sync complete."
  else
    echo "${LOG_PREFIX} WARNING: S3_BUCKET set but 'aws' CLI is not installed."
  fi
fi

# Optional custom sync command (e.g. rclone, rsync)
if [ -n "${OFFSERVER_SYNC_CMD:-}" ]; then
  echo "${LOG_PREFIX} Executing custom off-server sync command..."
  eval "${OFFSERVER_SYNC_CMD}"
  echo "${LOG_PREFIX} Custom sync finished."
fi

# Local Retention Policy: Prune backups older than RETENTION_DAYS
echo "${LOG_PREFIX} Pruning local backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -type f \( -name "pos_backup_*.dump" -o -name "pos_backup_*.dump.sha256" \) -mtime "+${RETENTION_DAYS}" -exec rm -f {} +

echo "${LOG_PREFIX} Backup pipeline completed successfully."
