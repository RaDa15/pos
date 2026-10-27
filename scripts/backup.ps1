# ==============================================================================
# POS SYSTEM - Automated PostgreSQL Backup Script (PowerShell)
# ==============================================================================
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\backup.ps1
# ==============================================================================

[CmdletBinding()]
param(
  [string]$BackupDir = ".\backups",
  [int]$RetentionDays = 30,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$PgHost = $(if ($env:PGHOST) { $env:PGHOST } else { "localhost" }),
  [int]$PgPort = $(if ($env:PGPORT) { [int]$env:PGPORT } else { 5432 }),
  [string]$PgDatabase = $(if ($env:PGDATABASE) { $env:PGDATABASE } else { "pos_dev" }),
  [string]$PgUser = $(if ($env:PGUSER) { $env:PGUSER } else { "pos" }),
  [string]$PgPassword = $(if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "pos_dev_pass" }),
  [string]$S3Bucket = $env:S3_BUCKET
)

$ErrorActionPreference = "Stop"

# Auto-discover DATABASE_URL from .env if not explicitly set
if (-not $DatabaseUrl) {
  $envPaths = @(".\apps\api\.env", ".\.env")
  foreach ($p in $envPaths) {
    if (Test-Path $p) {
      $match = (Get-Content $p | Where-Object { $_ -match "^DATABASE_URL=(.+)$" } | Select-Object -First 1)
      if ($match -match "^DATABASE_URL=(.+)$") {
        $DatabaseUrl = $Matches[1].Trim()
        break
      }
    }
  }
}

if ($DatabaseUrl -and $DatabaseUrl -match "postgresql://([^:]+):([^@]+)@([^:/]+)(?::(\d+))?/([^?]+)") {
  $PgUser = $Matches[1]
  $PgPassword = $Matches[2]
  $PgHost = $Matches[3]
  if ($Matches[4]) { $PgPort = [int]$Matches[4] }
  $PgDatabase = $Matches[5]
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFilename = "pos_backup_$timestamp.dump"

if (-not (Test-Path $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$backupPath = Join-Path $BackupDir $backupFilename
$checksumPath = "$backupPath.sha256"

Write-Host "[$((Get-Date).ToString('s'))] [POS-BACKUP] Starting backup for '$PgDatabase'..." -ForegroundColor Cyan

# Set PG password in environment for pg_dump
$env:PGPASSWORD = $PgPassword

try {
  $hasNativePgDump = [bool](Get-Command pg_dump -ErrorAction SilentlyContinue)

  if ($hasNativePgDump) {
    if ($DatabaseUrl) {
      & pg_dump --format=custom --compress=9 --no-owner --no-privileges $DatabaseUrl --file=$backupPath
    } else {
      & pg_dump --host=$PgHost --port=$PgPort --username=$PgUser --format=custom --compress=9 --no-owner --no-privileges --file=$backupPath $PgDatabase
    }
  } else {
    # Check for running Postgres Docker container
    $container = (docker ps --filter "name=postgres" --format "{{.ID}}" | Select-Object -First 1)
    if (-not $container) {
      $container = (docker ps --filter "ancestor=postgres:17-alpine" --format "{{.ID}}" | Select-Object -First 1)
    }

    if ($container) {
      Write-Host "[$((Get-Date).ToString('s'))] [POS-BACKUP] Using Docker Postgres container '$container'..." -ForegroundColor Gray
      $containerTmpDump = "/tmp/pos_backup_temp.dump"
      & docker exec -e PGPASSWORD=$PgPassword $container pg_dump --username=$PgUser --format=custom --compress=9 --no-owner --no-privileges --file=$containerTmpDump $PgDatabase
      & docker cp "$($container):$containerTmpDump" $backupPath
      & docker exec $container rm -f $containerTmpDump
    } else {
      throw "Neither native 'pg_dump' nor a running Postgres Docker container was found."
    }
  }

  if (-not (Test-Path $backupPath) -or (Get-Item $backupPath).Length -eq 0) {
    throw "Backup file '$backupPath' was not created or is empty!"
  }

  $sizeMb = [math]::Round((Get-Item $backupPath).Length / 1MB, 2)
  Write-Host "[$((Get-Date).ToString('s'))] [POS-BACKUP] Dump created: $backupFilename ($sizeMb MB)" -ForegroundColor Green

  # Calculate SHA-256
  $hash = (Get-FileHash -Path $backupPath -Algorithm SHA256).Hash.ToLower()
  "$hash  $backupFilename" | Out-File -FilePath $checksumPath -Encoding ascii
  Write-Host "[$((Get-Date).ToString('s'))] [POS-BACKUP] SHA-256: $hash" -ForegroundColor Gray

  # Remote S3 sync if configured
  if ($S3Bucket) {
    Write-Host "[$((Get-Date).ToString('s'))] [POS-BACKUP] Syncing to S3: $S3Bucket..." -ForegroundColor Cyan
    & aws s3 cp $backupPath "$S3Bucket/$backupFilename" --sse AES256
    & aws s3 cp $checksumPath "$S3Bucket/$backupFilename.sha256" --sse AES256
  }

  # Retention cleanup
  $cutoffDate = (Get-Date).AddDays(-$RetentionDays)
  Get-ChildItem -Path $BackupDir -Filter "pos_backup_*" | Where-Object {
    $_.LastWriteTime -lt $cutoffDate
  } | ForEach-Object {
    Write-Host "[$((Get-Date).ToString('s'))] [POS-BACKUP] Pruning old backup: $($_.Name)" -ForegroundColor Yellow
    Remove-Item $_.FullName -Force
  }

  Write-Host "[$((Get-Date).ToString('s'))] [POS-BACKUP] Backup completed successfully." -ForegroundColor Green
} catch {
  Write-Error "Backup failed: $_"
  exit 1
}
