<#
.SYNOPSIS
    Fallback installer: runs SecureTrack at boot via Task Scheduler instead of NSSM.

.DESCRIPTION
    Use this only when nssm.exe cannot be downloaded to the server. It uses
    nothing but built-in Windows features.

    Trade-offs versus the NSSM service:
      * The app does not appear in services.msc — manage it with Get-ScheduledTask.
      * Log rotation is not automatic; Rotate-Logs.ps1 is registered to trim them.
      * Crash restart is handled by Task Scheduler and is slower (1 minute).

    Prefer Install-SecureTrack.ps1 when you can.

.PARAMETER TaskName
    Scheduled task name. Default: SecureTrack

.PARAMETER Port
    TCP port the app listens on. Default: 5000
#>
[CmdletBinding()]
param(
    [string]$TaskName = 'SecureTrack',
    [int]$Port = 5000
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell window."
}

$AppRoot    = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$BackendDir = Join-Path $AppRoot 'backend'
$BuildDir   = Join-Path $AppRoot 'frontend\build'
$LogDir     = Join-Path $AppRoot 'logs'

Write-Step "Application root: $AppRoot"

# ── Preflight ────────────────────────────────────────────────────────────────
Write-Step 'Checking prerequisites'

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw "node.exe not found on PATH. Install Node.js 20 LTS (x64) and reopen PowerShell." }
$NodeExe = $node.Source
Write-Ok "Node: $(& $NodeExe --version) ($NodeExe)"

if (-not (Test-Path (Join-Path $BackendDir 'node_modules'))) {
    throw "Backend dependencies are missing. Run:  cd $BackendDir ; npm ci --omit=dev"
}
if (-not (Test-Path (Join-Path $BuildDir 'index.html'))) {
    throw "No production build found. Run:  cd $AppRoot\frontend ; npm ci ; npm run build"
}
if (-not (Test-Path (Join-Path $BackendDir '.env'))) {
    throw "backend\.env is missing. Run:  cd $BackendDir ; npm run gen-secrets"
}
Write-Ok 'Dependencies, build and .env all present'

New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

# ── Replace any existing task ────────────────────────────────────────────────
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Write-Step "Removing existing task '$TaskName'"
    Stop-ScheduledTask   -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Start-Sleep -Seconds 2
}

# ── Register ─────────────────────────────────────────────────────────────────
Write-Step "Registering scheduled task '$TaskName'"

# cmd.exe is used purely to redirect stdout/stderr into a log file;
# Task Scheduler cannot capture process output on its own.
$logFile = Join-Path $LogDir 'securetrack.log'
$cmdLine = "/c `"`"$NodeExe`" server.js >> `"$logFile`" 2>&1`""

$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" `
                                  -Argument $cmdLine `
                                  -WorkingDirectory $BackendDir

$trigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -MultipleInstances IgnoreNew

$taskPrincipal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName `
    -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrincipal `
    -Description 'SecureTrack v2 application server' | Out-Null

Write-Ok 'Task registered (runs as SYSTEM at every boot)'

# NODE_ENV lives in backend\.env for this installation method — make sure it is set.
$envFile = Join-Path $BackendDir '.env'
if ((Get-Content $envFile -Raw) -notmatch '(?m)^\s*NODE_ENV\s*=\s*production') {
    Add-Content -Path $envFile -Value "`r`nNODE_ENV=production"
    Write-Ok 'Added NODE_ENV=production to backend\.env'
}

# ── Start ────────────────────────────────────────────────────────────────────
Write-Step 'Starting task'
Start-ScheduledTask -TaskName $TaskName

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
    Write-Host " SecureTrack is running as scheduled task '$TaskName'" -ForegroundColor Green
    Write-Host '========================================================' -ForegroundColor Green
    Write-Host ""
    Write-Host "  Local URL : http://localhost:$Port"
    Write-Host "  Log file  : $logFile"
    Write-Host ""
    Write-Host "  Stop    : Stop-ScheduledTask -TaskName $TaskName ; Stop-Process -Name node -Force"
    Write-Host "  Start   : Start-ScheduledTask -TaskName $TaskName"
    Write-Host "  Status  : Get-ScheduledTask -TaskName $TaskName"
} else {
    Write-Host 'App did not become healthy within 20 seconds.' -ForegroundColor Red
    Write-Host "Check the log:  Get-Content '$logFile' -Tail 40"
    exit 1
}
