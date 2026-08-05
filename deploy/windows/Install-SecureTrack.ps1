<#
.SYNOPSIS
    Installs SecureTrack as an auto-starting Windows service using NSSM.

.DESCRIPTION
    One service runs the whole application: the Node backend serves the API and
    also serves the compiled React client, so there is no second process and no
    PowerShell window to keep open.

    The service starts automatically at boot, restarts itself if Node crashes,
    and writes rotating logs to <app root>\logs.

.PARAMETER ServiceName
    Windows service name. Default: SecureTrack

.PARAMETER Port
    TCP port the app listens on. Default: 5000

.PARAMETER NssmPath
    Full path to nssm.exe. If omitted the script looks for nssm.exe on PATH,
    then in deploy\windows\nssm.exe.

.EXAMPLE
    .\Install-SecureTrack.ps1
    .\Install-SecureTrack.ps1 -Port 8080 -ServiceName SecureTrack
#>
[CmdletBinding()]
param(
    [string]$ServiceName = 'SecureTrack',
    [int]$Port = 5000,
    [string]$NssmPath
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# ── Must be elevated ─────────────────────────────────────────────────────────
$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell window."
}

# ── Locate paths ─────────────────────────────────────────────────────────────
$AppRoot    = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$BackendDir = Join-Path $AppRoot 'backend'
$BuildDir   = Join-Path $AppRoot 'frontend\build'
$LogDir     = Join-Path $AppRoot 'logs'

Write-Step "Application root: $AppRoot"

# ── Preflight checks ─────────────────────────────────────────────────────────
Write-Step 'Checking prerequisites'

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw "node.exe not found on PATH. Install Node.js 20 LTS (x64) and reopen PowerShell." }
$NodeExe = $node.Source
$nodeVersion = (& $NodeExe --version)
Write-Ok "Node: $nodeVersion ($NodeExe)"

$major = [int](($nodeVersion -replace '^v','') -split '\.')[0]
if ($major -lt 18) { throw "Node $nodeVersion is too old. Install Node.js 20 LTS (x64)." }

if (-not (Test-Path (Join-Path $BackendDir 'node_modules'))) {
    throw "Backend dependencies are missing. Run:  cd $BackendDir ; npm ci --omit=dev"
}
Write-Ok 'Backend dependencies present'

if (-not (Test-Path (Join-Path $BuildDir 'index.html'))) {
    throw "No production build found. Run:  cd $AppRoot\frontend ; npm ci ; npm run build"
}
Write-Ok 'Frontend production build present'

$EnvFile = Join-Path $BackendDir '.env'
if (-not (Test-Path $EnvFile)) {
    throw "backend\.env is missing. Run:  cd $BackendDir ; npm run gen-secrets"
}

$envText = Get-Content $EnvFile -Raw
foreach ($key in @('JWT_SECRET','JWT_REFRESH_SECRET')) {
    if ($envText -notmatch "(?m)^\s*$key\s*=\s*\S{32,}") {
        throw "$key is missing or shorter than 32 characters in backend\.env."
    }
}
Write-Ok 'backend\.env contains valid secrets'

if ($envText -notmatch '(?m)^\s*NODE_ENV\s*=\s*production') {
    Write-Warn 'NODE_ENV is not set to production in backend\.env — the service will force it anyway.'
}

# ── Locate NSSM ──────────────────────────────────────────────────────────────
Write-Step 'Locating NSSM (service wrapper)'

if (-not $NssmPath) {
    $onPath = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if ($onPath) {
        $NssmPath = $onPath.Source
    } elseif (Test-Path (Join-Path $PSScriptRoot 'nssm.exe')) {
        $NssmPath = Join-Path $PSScriptRoot 'nssm.exe'
    }
}

if (-not $NssmPath -or -not (Test-Path $NssmPath)) {
    Write-Host ''
    Write-Host '  nssm.exe was not found.' -ForegroundColor Red
    Write-Host '  Download https://nssm.cc/release/nssm-2.24.zip on any machine, extract it,'
    Write-Host "  and copy win64\nssm.exe into:  $PSScriptRoot"
    Write-Host '  Then run this script again.'
    Write-Host ''
    Write-Host '  No internet on the server? Use the built-in alternative instead:'
    Write-Host '      .\Install-SecureTrack-ScheduledTask.ps1'
    throw 'nssm.exe not found.'
}
Write-Ok "NSSM: $NssmPath"

# ── Remove an existing installation ──────────────────────────────────────────
$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Step "Removing existing '$ServiceName' service"
    if ($existing.Status -ne 'Stopped') {
        & $NssmPath stop $ServiceName confirm | Out-Null
        Start-Sleep -Seconds 3
    }
    & $NssmPath remove $ServiceName confirm | Out-Null
    Start-Sleep -Seconds 2
    Write-Ok 'Old service removed'
}

# ── Install ──────────────────────────────────────────────────────────────────
Write-Step "Installing service '$ServiceName'"

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

& $NssmPath install $ServiceName $NodeExe 'server.js' | Out-Null

& $NssmPath set $ServiceName AppDirectory   $BackendDir            | Out-Null
& $NssmPath set $ServiceName DisplayName    'SecureTrack'          | Out-Null
& $NssmPath set $ServiceName Description    'SecureTrack v2 — vulnerability, application and risk tracking platform' | Out-Null
& $NssmPath set $ServiceName Start          SERVICE_AUTO_START     | Out-Null

# NODE_ENV is forced here so the app can never boot in development mode,
# whatever backend\.env happens to say.
& $NssmPath set $ServiceName AppEnvironmentExtra "NODE_ENV=production" "PORT=$Port" | Out-Null

# Logs: rotate at 10 MB, keep rotating while the service runs
& $NssmPath set $ServiceName AppStdout        (Join-Path $LogDir 'securetrack.out.log') | Out-Null
& $NssmPath set $ServiceName AppStderr        (Join-Path $LogDir 'securetrack.err.log') | Out-Null
& $NssmPath set $ServiceName AppRotateFiles   1        | Out-Null
& $NssmPath set $ServiceName AppRotateOnline  1        | Out-Null
& $NssmPath set $ServiceName AppRotateBytes   10485760 | Out-Null

# Stop: send CTRL-C first so the app can checkpoint SQLite before exiting
& $NssmPath set $ServiceName AppStopMethodConsole 15000 | Out-Null
& $NssmPath set $ServiceName AppStopMethodWindow  5000  | Out-Null
& $NssmPath set $ServiceName AppStopMethodThreads 5000  | Out-Null

# Crash recovery: restart after 5s, but give up if it keeps dying instantly
& $NssmPath set $ServiceName AppExit Default Restart | Out-Null
& $NssmPath set $ServiceName AppRestartDelay 5000    | Out-Null
& $NssmPath set $ServiceName AppThrottle     10000   | Out-Null

Write-Ok 'Service registered'

# ── Start ────────────────────────────────────────────────────────────────────
Write-Step 'Starting service'
& $NssmPath start $ServiceName | Out-Null

$healthy = $false
foreach ($i in 1..20) {
    Start-Sleep -Seconds 1
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) { $healthy = $true; break }
    } catch { }
}

Write-Host ''
if ($healthy) {
    Write-Host '========================================================' -ForegroundColor Green
    Write-Host " SecureTrack is running as service '$ServiceName'" -ForegroundColor Green
    Write-Host '========================================================' -ForegroundColor Green
    Write-Host ""
    Write-Host "  Local URL   : http://localhost:$Port"
    Write-Host "  Logs        : $LogDir"
    Write-Host "  Starts at boot, no PowerShell window needed."
    Write-Host ""
    Write-Host "  Next steps:"
    Write-Host "    1. .\Set-SecureTrackFirewall.ps1 -Port $Port"
    Write-Host "    2. .\Register-BackupTask.ps1"
    Write-Host "    3. Log in and change the admin password."
} else {
    Write-Host 'Service did not become healthy within 20 seconds.' -ForegroundColor Red
    Write-Host "Check the log:  Get-Content '$LogDir\securetrack.err.log' -Tail 40"
    Write-Host "Service state:  Get-Service $ServiceName"
    exit 1
}
