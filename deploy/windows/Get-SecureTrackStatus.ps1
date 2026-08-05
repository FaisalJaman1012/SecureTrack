<#
.SYNOPSIS
    One-shot health report for a SecureTrack installation.

.DESCRIPTION
    Shows whether the service is running, whether the port answers, database and
    upload sizes, the newest backup, and the last error lines. Run this first
    whenever something looks wrong.

.EXAMPLE
    .\Get-SecureTrackStatus.ps1
#>
[CmdletBinding()]
param(
    [string]$ServiceName = 'SecureTrack',
    [int]$Port = 5000
)

$AppRoot    = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$BackendDir = Join-Path $AppRoot 'backend'
$LogDir     = Join-Path $AppRoot 'logs'
$BackupDir  = Join-Path $AppRoot 'backups'

function Line($label, $value, $color = 'Gray') {
    Write-Host ('  {0,-22}' -f "$label :") -NoNewline
    Write-Host $value -ForegroundColor $color
}

Write-Host ''
Write-Host 'SecureTrack status' -ForegroundColor Cyan
Write-Host '------------------' -ForegroundColor Cyan
Line 'App root' $AppRoot

# ── Service / task ───────────────────────────────────────────────────────────
$svc = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($svc) {
    Line 'Service' "$($svc.Status) (StartType=$($svc.StartType))" $(if ($svc.Status -eq 'Running') { 'Green' } else { 'Red' })
} else {
    $task = Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
    if ($task) {
        Line 'Scheduled task' $task.State $(if ($task.State -eq 'Running') { 'Green' } else { 'Red' })
    } else {
        Line 'Service/task' 'NOT INSTALLED' 'Red'
    }
}

$nodeProcs = @(Get-Process node -ErrorAction SilentlyContinue)
if ($nodeProcs.Count) {
    $mb = [math]::Round(($nodeProcs | Measure-Object WorkingSet64 -Sum).Sum / 1MB, 1)
    Line 'node.exe processes' "$($nodeProcs.Count) (using $mb MB)"
} else {
    Line 'node.exe processes' '0' 'Red'
}

# ── Health endpoint ──────────────────────────────────────────────────────────
try {
    $r = Invoke-WebRequest -Uri "http://localhost:$Port/api/health" -UseBasicParsing -TimeoutSec 5
    Line 'Health endpoint' "HTTP $($r.StatusCode) — $($r.Content)" 'Green'
} catch {
    Line 'Health endpoint' "unreachable on port $Port" 'Red'
}

$rule = Get-NetFirewallRule -DisplayName 'SecureTrack HTTP' -ErrorAction SilentlyContinue
Line 'Firewall rule' $(if ($rule) { "present ($($rule.Enabled))" } else { 'not configured' }) $(if ($rule) { 'Green' } else { 'Yellow' })

# ── Data ─────────────────────────────────────────────────────────────────────
$dbFile = Join-Path $BackendDir 'securetrack.db'
if (Test-Path $dbFile) {
    $db = Get-Item $dbFile
    Line 'Database' ("{0} MB, modified {1}" -f [math]::Round($db.Length / 1MB, 2), $db.LastWriteTime)
} else {
    Line 'Database' 'not created yet' 'Yellow'
}

$uploads = Join-Path $BackendDir 'uploads'
if (Test-Path $uploads) {
    $files = @(Get-ChildItem $uploads -Recurse -File)
    $mb = if ($files.Count) { [math]::Round(($files | Measure-Object Length -Sum).Sum / 1MB, 2) } else { 0 }
    Line 'Attachments' "$($files.Count) files, $mb MB"
}

if (Test-Path $BackupDir) {
    $last = Get-ChildItem $BackupDir -Filter 'securetrack-*.db' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($last) {
        $ageHours = [math]::Round(((Get-Date) - $last.LastWriteTime).TotalHours, 1)
        Line 'Latest backup' "$($last.Name) ($ageHours h ago)" $(if ($ageHours -lt 48) { 'Green' } else { 'Yellow' })
    } else {
        Line 'Latest backup' 'none found' 'Yellow'
    }
} else {
    Line 'Latest backup' 'no backup folder' 'Yellow'
}

# ── Disk ─────────────────────────────────────────────────────────────────────
$drive = (Get-Item $AppRoot).PSDrive
if ($drive.Free -ne $null) {
    $freeGb = [math]::Round($drive.Free / 1GB, 1)
    Line 'Free disk space' "$freeGb GB on $($drive.Name):" $(if ($freeGb -gt 5) { 'Green' } else { 'Red' })
}

# ── Recent errors ────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '  Recent log output' -ForegroundColor Cyan
$logFile = @(
    (Join-Path $LogDir 'securetrack.err.log'),
    (Join-Path $LogDir 'securetrack.log')
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($logFile) {
    Get-Content $logFile -Tail 15 | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
} else {
    Write-Host '    no log file found' -ForegroundColor DarkGray
}
Write-Host ''
