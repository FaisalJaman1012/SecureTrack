<#
.SYNOPSIS
    Backs up the SecureTrack database and uploaded attachments.

.DESCRIPTION
    Safe to run while the service is running: the database is copied through
    SQLite's online backup API (see backend\scripts\backup-db.js) and verified
    with an integrity check, then attachments are zipped. Backups older than
    -KeepDays are deleted.

.EXAMPLE
    .\Backup-SecureTrack.ps1
    .\Backup-SecureTrack.ps1 -BackupRoot 'D:\Backups\SecureTrack' -KeepDays 60
#>
[CmdletBinding()]
param(
    [string]$BackupRoot,
    [int]$KeepDays = 30
)

$ErrorActionPreference = 'Stop'

$AppRoot    = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$BackendDir = Join-Path $AppRoot 'backend'
$UploadsDir = Join-Path $BackendDir 'uploads'
if (-not $BackupRoot) { $BackupRoot = Join-Path $AppRoot 'backups' }

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null

$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm-ss'
Write-Host "[$stamp] SecureTrack backup starting -> $BackupRoot"

# ── Database (online backup + integrity check) ───────────────────────────────
$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'node.exe not found on PATH.' }

Push-Location $BackendDir
try {
    & $node.Source (Join-Path $BackendDir 'scripts\backup-db.js') $BackupRoot
    if ($LASTEXITCODE -ne 0) { throw "Database backup failed with exit code $LASTEXITCODE." }
} finally {
    Pop-Location
}

# ── Attachments ──────────────────────────────────────────────────────────────
if (Test-Path $UploadsDir) {
    $zip = Join-Path $BackupRoot "uploads-$stamp.zip"
    Compress-Archive -Path (Join-Path $UploadsDir '*') -DestinationPath $zip -CompressionLevel Optimal -Force -ErrorAction SilentlyContinue
    if (Test-Path $zip) {
        $mb = [math]::Round((Get-Item $zip).Length / 1MB, 2)
        Write-Host "Attachments archived: $zip ($mb MB)"
    } else {
        Write-Host 'No attachments to archive.'
    }
}

# ── Retention ────────────────────────────────────────────────────────────────
$cutoff = (Get-Date).AddDays(-$KeepDays)
$old = Get-ChildItem -Path $BackupRoot -File |
       Where-Object { $_.Name -match '^(securetrack-|uploads-)' -and $_.LastWriteTime -lt $cutoff }

foreach ($f in $old) {
    Remove-Item $f.FullName -Force
    Write-Host "Pruned old backup: $($f.Name)"
}

Write-Host "Backup complete. Retaining $KeepDays days." -ForegroundColor Green
