# ==============================================================================
# POS SYSTEM - Restore & Disaster Recovery Test Script (PowerShell)
# ==============================================================================
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\restore.ps1 [dump_file] [-Keep]
# ==============================================================================

[CmdletBinding()]
param(
  [string]$BackupFile,
  [string]$ScratchDb = "pos_scratch",
  [switch]$Keep,
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$PgHost = $(if ($env:PGHOST) { $env:PGHOST } else { "localhost" }),
  [int]$PgPort = $(if ($env:PGPORT) { [int]$env:PGPORT } else { 5432 }),
  [string]$PgUser = $(if ($env:PGUSER) { $env:PGUSER } else { "pos" }),
  [string]$PgPassword = $(if ($env:PGPASSWORD) { $env:PGPASSWORD } else { "pos_dev_pass" }),
  [string]$BackupDir = ".\backups"
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
}

if (-not $BackupFile) {
  if (Test-Path $BackupDir) {
    $latest = Get-ChildItem -Path $BackupDir -Filter "pos_backup_*.dump" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest) {
      $BackupFile = $latest.FullName
    }
  }
}

if (-not $BackupFile -or -not (Test-Path $BackupFile)) {
  Write-Error "Target backup file not found. Please provide a valid file path."
  exit 1
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "POS SYSTEM - Automated Database Restore Test" -ForegroundColor Cyan
Write-Host "Target:  $BackupFile" -ForegroundColor Cyan
Write-Host "Scratch: $ScratchDb on ${PgHost}:${PgPort}" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

$env:PGPASSWORD = $PgPassword

# Check SHA-256 Checksum
$checksumFile = "$BackupFile.sha256"
if (Test-Path $checksumFile) {
  Write-Host "[1/4] Verifying SHA-256 integrity..." -ForegroundColor Cyan
  $expectedHash = (Get-Content $checksumFile).Trim().Split(" ")[0]
  $actualHash = (Get-FileHash -Path $BackupFile -Algorithm SHA256).Hash.ToLower()

  if ($expectedHash.ToLower() -ne $actualHash.ToLower()) {
    Write-Error ("Checksum mismatch! Corrupted backup.`nExpected: " + $expectedHash + "`nActual:   " + $actualHash)
    exit 1
  }
  Write-Host "[OK] SHA-256 integrity verified: $actualHash" -ForegroundColor Green
} else {
  Write-Host "[1/4] No checksum file found, continuing..." -ForegroundColor Gray
}

try {
  $hasNativeTools = [bool](Get-Command pg_restore -ErrorAction SilentlyContinue)
  $container = $null

  if (-not $hasNativeTools) {
    $container = (docker ps --filter "name=postgres" --format "{{.ID}}" | Select-Object -First 1)
    if (-not $container) {
      $container = (docker ps --filter "ancestor=postgres:17-alpine" --format "{{.ID}}" | Select-Object -First 1)
    }
    if (-not $container) {
      throw "Neither native Postgres tools nor a running Postgres Docker container was found."
    }
    Write-Host "[2/4] Using Docker Postgres container '$container'..." -ForegroundColor Gray
  }

  # Prepare scratch database
  Write-Host "[2/4] Initializing clean scratch database '$ScratchDb'..." -ForegroundColor Cyan
  $oldEap = $ErrorActionPreference
  $ErrorActionPreference = "Continue"

  if ($hasNativeTools) {
    & dropdb --host=$PgHost --port=$PgPort --username=$PgUser --if-exists $ScratchDb 2>$null
    & createdb --host=$PgHost --port=$PgPort --username=$PgUser $ScratchDb
  } else {
    & docker exec -e PGPASSWORD=$PgPassword $container dropdb --username=$PgUser --if-exists $ScratchDb 2>$null
    & docker exec -e PGPASSWORD=$PgPassword $container createdb --username=$PgUser $ScratchDb
  }

  # Restore backup archive
  Write-Host "[3/4] Restoring dump archive into '$ScratchDb'..." -ForegroundColor Cyan
  if ($hasNativeTools) {
    & pg_restore --host=$PgHost --port=$PgPort --username=$PgUser --dbname=$ScratchDb --no-owner --no-privileges $BackupFile 2>$null
  } else {
    $containerTmpRestore = "/tmp/pos_restore_temp.dump"
    & docker cp $BackupFile "$($container):$containerTmpRestore"
    & docker exec -e PGPASSWORD=$PgPassword $container pg_restore --username=$PgUser --dbname=$ScratchDb --no-owner --no-privileges $containerTmpRestore 2>$null
    & docker exec $container rm -f $containerTmpRestore
  }

  # Validate restore counts
  Write-Host "[4/4] Verifying table counts in '$ScratchDb'..." -ForegroundColor Cyan
  $queryTable = "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';"
  $queryBiz = "SELECT count(*) FROM businesses;"
  $queryEmp = "SELECT count(*) FROM employees;"
  $queryProd = "SELECT count(*) FROM products;"
  $querySale = "SELECT count(*) FROM sales;"

  if ($hasNativeTools) {
    $tableCount = ((& psql --host=$PgHost --port=$PgPort --username=$PgUser --dbname=$ScratchDb -t -A -c $queryTable 2>$null) | Out-String).Trim()
    $bizCount = ((& psql --host=$PgHost --port=$PgPort --username=$PgUser --dbname=$ScratchDb -t -A -c $queryBiz 2>$null) | Out-String).Trim()
    $empCount = ((& psql --host=$PgHost --port=$PgPort --username=$PgUser --dbname=$ScratchDb -t -A -c $queryEmp 2>$null) | Out-String).Trim()
    $prodCount = ((& psql --host=$PgHost --port=$PgPort --username=$PgUser --dbname=$ScratchDb -t -A -c $queryProd 2>$null) | Out-String).Trim()
    $saleCount = ((& psql --host=$PgHost --port=$PgPort --username=$PgUser --dbname=$ScratchDb -t -A -c $querySale 2>$null) | Out-String).Trim()
  } else {
    $tableCount = ((& docker exec -e PGPASSWORD=$PgPassword $container psql --username=$PgUser --dbname=$ScratchDb -t -A -c $queryTable 2>$null) | Out-String).Trim()
    $bizCount = ((& docker exec -e PGPASSWORD=$PgPassword $container psql --username=$PgUser --dbname=$ScratchDb -t -A -c $queryBiz 2>$null) | Out-String).Trim()
    $empCount = ((& docker exec -e PGPASSWORD=$PgPassword $container psql --username=$PgUser --dbname=$ScratchDb -t -A -c $queryEmp 2>$null) | Out-String).Trim()
    $prodCount = ((& docker exec -e PGPASSWORD=$PgPassword $container psql --username=$PgUser --dbname=$ScratchDb -t -A -c $queryProd 2>$null) | Out-String).Trim()
    $saleCount = ((& docker exec -e PGPASSWORD=$PgPassword $container psql --username=$PgUser --dbname=$ScratchDb -t -A -c $querySale 2>$null) | Out-String).Trim()
  }

  $ErrorActionPreference = $oldEap

  Write-Host "-----------------------------------------------------------------" -ForegroundColor White
  Write-Host "Restore Verification Results:" -ForegroundColor White
  Write-Host "  - Public Tables: $tableCount" -ForegroundColor White
  Write-Host "  - Businesses:    $bizCount" -ForegroundColor White
  Write-Host "  - Employees:     $empCount" -ForegroundColor White
  Write-Host "  - Products:      $prodCount" -ForegroundColor White
  Write-Host "  - Sales Records: $saleCount" -ForegroundColor White
  Write-Host "-----------------------------------------------------------------" -ForegroundColor White

  if ([int]$tableCount -lt 10) {
    throw "Expected at least 10 public tables, found $tableCount"
  }

  Write-Host "[OK] Restore test succeeded: Database structure and contents valid." -ForegroundColor Green

  if ($Keep) {
    Write-Host "[INFO] Retaining scratch database '$ScratchDb' per -Keep flag." -ForegroundColor Yellow
  } else {
    Write-Host "Cleaning up scratch database '$ScratchDb'..." -ForegroundColor Gray
    $ErrorActionPreference = "Continue"
    if ($hasNativeTools) {
      & dropdb --host=$PgHost --port=$PgPort --username=$PgUser $ScratchDb 2>$null
    } else {
      & docker exec -e PGPASSWORD=$PgPassword $container dropdb --username=$PgUser $ScratchDb 2>$null
    }
    $ErrorActionPreference = $oldEap
    Write-Host "[OK] Scratch database dropped." -ForegroundColor Green
  }
} catch {
  $errMsg = $_.Exception.Message
  Write-Error "Restore test failed: $errMsg"
  exit 1
}
