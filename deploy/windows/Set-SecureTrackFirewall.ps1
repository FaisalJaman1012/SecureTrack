<#
.SYNOPSIS
    Opens the SecureTrack port on the Windows firewall.

.DESCRIPTION
    By default the rule is restricted to private/domain networks. Pass
    -AllowedSubnet to lock it down to a specific network range, which is
    strongly recommended for an internal security tool.

.EXAMPLE
    .\Set-SecureTrackFirewall.ps1
    .\Set-SecureTrackFirewall.ps1 -Port 5000 -AllowedSubnet '10.10.0.0/16'
    .\Set-SecureTrackFirewall.ps1 -Remove
#>
[CmdletBinding()]
param(
    [int]$Port = 5000,
    [string]$AllowedSubnet,
    [string]$RuleName = 'SecureTrack HTTP',
    [switch]$Remove
)

$ErrorActionPreference = 'Stop'

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell window."
}

if (Get-NetFirewallRule -DisplayName $RuleName -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName $RuleName
    Write-Host "Removed existing rule '$RuleName'." -ForegroundColor Yellow
}

if ($Remove) {
    Write-Host 'Done — port is closed.' -ForegroundColor Green
    return
}

$params = @{
    DisplayName = $RuleName
    Description = 'Inbound access to the SecureTrack web application'
    Direction   = 'Inbound'
    Action      = 'Allow'
    Protocol    = 'TCP'
    LocalPort   = $Port
    Profile     = 'Domain,Private'
}
if ($AllowedSubnet) { $params.RemoteAddress = $AllowedSubnet }

New-NetFirewallRule @params | Out-Null

Write-Host "Opened TCP $Port for Domain+Private profiles." -ForegroundColor Green
if ($AllowedSubnet) {
    Write-Host "Restricted to $AllowedSubnet." -ForegroundColor Green
} else {
    Write-Host "No source restriction set. Consider re-running with -AllowedSubnet '10.0.0.0/8'." -ForegroundColor Yellow
}
