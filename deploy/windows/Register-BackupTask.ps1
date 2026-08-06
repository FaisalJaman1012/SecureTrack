<#
.SYNOPSIS
    Registers a daily scheduled task that backs up SecureTrack.

.EXAMPLE
    .\Register-BackupTask.ps1
    .\Register-BackupTask.ps1 -At '01:30' -BackupRoot 'D:\Backups\SecureTrack' -KeepDays 60
#>
[CmdletBinding()]
param(
    [string]$TaskName = 'SecureTrack Daily Backup',
    [string]$At = '02:00',
    [string]$BackupRoot,
    [int]$KeepDays = 30
)

$ErrorActionPreference = 'Stop'

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell window."
}

$script = Join-Path $PSScriptRoot 'Backup-SecureTrack.ps1'
if (-not (Test-Path $script)) { throw "Not found: $script" }

# Not $args — that is a PowerShell automatic variable.
$taskArgs = "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -KeepDays $KeepDays"
if ($BackupRoot) { $taskArgs += " -BackupRoot `"$BackupRoot`"" }

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Replaced existing task '$TaskName'." -ForegroundColor Yellow
}

$action    = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $taskArgs
$trigger   = New-ScheduledTaskTrigger -Daily -At $At
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$taskPrinc = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName $TaskName `
    -Action $action -Trigger $trigger -Settings $settings -Principal $taskPrinc `
    -Description 'Daily online backup of the SecureTrack database and attachments' | Out-Null

Write-Host "Registered '$TaskName' — runs daily at $At, keeps $KeepDays days." -ForegroundColor Green
Write-Host "Test it now with:  Start-ScheduledTask -TaskName '$TaskName'"
