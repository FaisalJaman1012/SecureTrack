<#
.SYNOPSIS
    Deploys a new version of SecureTrack without touching production data.

.DESCRIPTION
    Two modes, matching whether the server currently has internet access.

    OFFLINE (normal for the isolated production network)
        .\Update-SecureTrack.ps1 -PackagePath C:\Temp\securetrack-2026-09-01_10-30.zip
        Applies a package built by New-DeploymentPackage.ps1 on a connected machine.

    ONLINE (only while an internet window is open)
        .\Update-SecureTrack.ps1
        Runs git pull, npm ci and npm run build directly on the server.

    In both modes the following are backed up first and never overwritten:
        backend\.env              secrets and configuration
        backend\securetrack.db    the database
        backend\uploads\          attachments
        backups\  logs\

    Schema changes ship as migrations that the application applies on start-up;
    it takes its own snapshot before altering anything. Nothing here drops or
    recreates the database.

.PARAMETER PackagePath
    ZIP produced by New-DeploymentPackage.ps1. Selects offline mode.

.PARAMETER Branch
    Branch to pull in online mode. Defaults to the checked-out branch.

.EXAMPLE
    .\Update-SecureTrack.ps1 -PackagePath D:\media\securetrack-2026-09-01_10-30.zip
    .\Update-SecureTrack.ps1 -Branch main
#>
[CmdletBinding()]
param(
    [string]$PackagePath,
    [string]$Branch,
    [string]$ServiceName = 'SecureTrack',
    [int]$Port = 5000
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell window."
}

$AppRoot     = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$BackendDir  = Join-Path $AppRoot 'backend'
$FrontendDir = Join-Path $AppRoot 'frontend'

$mode = if ($PackagePath) { 'offline package' } else { 'online git pull' }
Write-Step "SecureTrack update — mode: $mode"
Write-Host "    App root: $AppRoot"

# ── Service control helpers ──────────────────────────────────────────────────
function Stop-App {
    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        Stop-Service -Name $ServiceName -Force
    } elseif (Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue) {
        Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
        Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
    } else {
        throw "Neither a service nor a scheduled task named '$ServiceName' exists."
    }
    # Give SQLite time to checkpoint and release the file
    Start-Sleep -Seconds 4
}

function Start-App {
    if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
        Start-Service -Name $ServiceName
    } else {
        Start-ScheduledTask -TaskName $ServiceName
    }
}

# ── 1. Back up before anything else ──────────────────────────────────────────
# Backup-SecureTrack.ps1 throws on any failure, and $ErrorActionPreference is
# Stop here, so a bad backup aborts the update before anything is touched.
Write-Step 'Backing up database and attachments'
& (Join-Path $PSScriptRoot 'Backup-SecureTrack.ps1')
Write-Ok 'Backup complete'

# Record what the data looked like, to prove afterwards that it survived
$dbFile = Join-Path $BackendDir 'securetrack.db'
$dbSizeBefore = if (Test-Path $dbFile) { (Get-Item $dbFile).Length } else { 0 }

# ── 2. Fetch the new version ─────────────────────────────────────────────────
if ($PackagePath) {

    if (-not (Test-Path $PackagePath)) { throw "Package not found: $PackagePath" }

    Write-Step 'Extracting the offline package'
    $extract = Join-Path ([IO.Path]::GetTempPath()) ("securetrack-pkg-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    Expand-Archive -Path $PackagePath -DestinationPath $extract -Force

    foreach ($required in @('backend\server.js', 'backend\node_modules', 'frontend\build\index.html')) {
        if (-not (Test-Path (Join-Path $extract $required))) {
            Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
            throw "Package looks incomplete — $required is missing. Rebuild it with New-DeploymentPackage.ps1."
        }
    }
    Write-Ok 'Package contents verified'

    Stop-App
    Write-Ok 'Service stopped'

    Write-Step 'Replacing application files'

    # Stale files in these two folders would otherwise survive the copy
    Remove-Item (Join-Path $BackendDir 'node_modules') -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item (Join-Path $FrontendDir 'build') -Recurse -Force -ErrorAction SilentlyContinue

    # /XD and /XF keep production data and secrets out of the copy's way.
    # Without /MIR, robocopy only adds and overwrites — it never deletes.
    robocopy $extract $AppRoot /E /NFL /NDL /NJH /NJS /NP `
        /XD (Join-Path $BackendDir 'uploads') (Join-Path $AppRoot 'backups') (Join-Path $AppRoot 'logs') (Join-Path $AppRoot '.git') `
        /XF '.env' 'securetrack.db' 'securetrack.db-wal' 'securetrack.db-shm' | Out-Null

    if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE." }
    Remove-Item $extract -Recurse -Force -ErrorAction SilentlyContinue
    Write-Ok 'Files replaced (data and .env untouched)'

} else {

    Write-Step 'Pulling latest code'
    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) {
        throw "git.exe not found. On an isolated server use -PackagePath instead."
    }

    Push-Location $AppRoot
    try {
        # Confirm the remote is actually reachable before stopping the service
        git ls-remote --exit-code origin 2>&1 | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Cannot reach the git remote. This server may be offline — use -PackagePath instead."
        }

        $current = (git rev-parse --abbrev-ref HEAD).Trim()
        $target = if ($Branch) { $Branch } else { $current }
        Write-Ok "Branch: $target"

        git pull origin $target
        if ($LASTEXITCODE -ne 0) { throw "git pull failed." }
    } finally { Pop-Location }

    Write-Step 'Installing backend dependencies'
    Push-Location $BackendDir
    try {
        npm ci --omit=dev
        if ($LASTEXITCODE -ne 0) { throw 'Backend npm ci failed.' }
    } finally { Pop-Location }

    Write-Step 'Building the client (several minutes)'
    Push-Location $FrontendDir
    try {
        npm ci
        if ($LASTEXITCODE -ne 0) { throw 'Frontend npm ci failed.' }
        npm run build
        if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed — the running version was left untouched.' }
    } finally { Pop-Location }

    Stop-App
    Write-Ok 'Service stopped'
}

# ── 3. Re-apply file permissions ─────────────────────────────────────────────
# A copy or a git pull recreates files with inherited ACLs.
Write-Step 'Re-applying file permissions'
& (Join-Path $PSScriptRoot 'Protect-SecureTrackFiles.ps1')

# ── 4. Start and verify ──────────────────────────────────────────────────────
Write-Step 'Starting the service'
Start-App

$healthy = $false
foreach ($i in 1..40) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
}

Write-Host ''
if (-not $healthy) {
    Write-Host 'Update applied but the health check failed.' -ForegroundColor Red
    Write-Host "  Logs   : Get-Content '$AppRoot\logs\securetrack.err.log' -Tail 40"
    Write-Host "  Restore: see section 13 of DEPLOYMENT_WINDOWS.md"
    exit 1
}

# ── 5. Confirm the data survived ─────────────────────────────────────────────
Write-Step 'Verifying data'
$dbSizeAfter = if (Test-Path $dbFile) { (Get-Item $dbFile).Length } else { 0 }

if ($dbSizeAfter -eq 0) {
    Write-Host '  DATABASE IS MISSING after the update. Restore from backups\ immediately.' -ForegroundColor Red
    exit 1
}

Write-Ok ("Database present: {0} MB (was {1} MB)" -f `
    [math]::Round($dbSizeAfter / 1MB, 2), [math]::Round($dbSizeBefore / 1MB, 2))

if (Test-Path (Join-Path $BackendDir '.env')) { Write-Ok 'backend\.env preserved' }
else { Write-Warn 'backend\.env is missing — the service would not have started. Check immediately.' }

$migrationLog = Get-ChildItem (Join-Path $AppRoot 'backups') -Filter 'securetrack-premigration-*.db' -ErrorAction SilentlyContinue |
                Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($migrationLog -and $migrationLog.LastWriteTime -gt (Get-Date).AddMinutes(-10)) {
    Write-Ok "Schema migration ran; pre-migration snapshot: $($migrationLog.Name)"
}

Write-Host ''
Write-Host 'Update complete — SecureTrack is healthy.' -ForegroundColor Green
Write-Host ''
