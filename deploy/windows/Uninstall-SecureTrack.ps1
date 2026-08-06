<#
.SYNOPSIS
    Removes the SecureTrack service/task, firewall rule and backup job.

.DESCRIPTION
    Application data (backend\securetrack.db, backend\uploads, backups) is
    never touched. Delete it by hand if you really mean to.

.EXAMPLE
    .\Uninstall-SecureTrack.ps1
#>
[CmdletBinding()]
param(
    [string]$ServiceName = 'SecureTrack',
    [string]$NssmPath
)

$ErrorActionPreference = 'Continue'

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell window."
}

if (-not $NssmPath) {
    $onPath = Get-Command nssm.exe -ErrorAction SilentlyContinue
    if ($onPath) { $NssmPath = $onPath.Source }
    elseif (Test-Path (Join-Path $PSScriptRoot 'nssm.exe')) { $NssmPath = Join-Path $PSScriptRoot 'nssm.exe' }
}

if (Get-Service -Name $ServiceName -ErrorAction SilentlyContinue) {
    if ($NssmPath) {
        & $NssmPath stop   $ServiceName confirm | Out-Null
        Start-Sleep -Seconds 3
        & $NssmPath remove $ServiceName confirm | Out-Null
    } else {
        Stop-Service -Name $ServiceName -Force -ErrorAction SilentlyContinue
        sc.exe delete $ServiceName | Out-Null
    }
    Write-Host "Removed service '$ServiceName'." -ForegroundColor Green
}

if (Get-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $ServiceName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $ServiceName -Confirm:$false
    Write-Host "Removed scheduled task '$ServiceName'." -ForegroundColor Green
}

if (Get-ScheduledTask -TaskName 'SecureTrack Daily Backup' -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName 'SecureTrack Daily Backup' -Confirm:$false
    Write-Host 'Removed backup task.' -ForegroundColor Green
}

if (Get-NetFirewallRule -DisplayName 'SecureTrack HTTP' -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName 'SecureTrack HTTP'
    Write-Host 'Removed firewall rule.' -ForegroundColor Green
}

Write-Host ''
Write-Host 'Uninstall complete. Database, uploads and backups were left in place.' -ForegroundColor Yellow
