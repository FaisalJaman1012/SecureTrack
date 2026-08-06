<#
.SYNOPSIS
    Locks down secrets, the git repository and application data with NTFS ACLs.

.DESCRIPTION
    After this runs, only SYSTEM and the local Administrators group can read
    backend\.env, the .git directory, the database and the uploaded files.
    Ordinary logged-on users and any network account lose access entirely.

    It also checks that nothing is being shared over SMB, since a file share is
    the usual way .git or a secret file leaks off a server.

    Re-run this after every deployment or upgrade — a fresh git clone or an
    unzip recreates files with inherited permissions.

.PARAMETER WhatIf
    Report what would change without changing anything.

.EXAMPLE
    .\Protect-SecureTrackFiles.ps1
#>
[CmdletBinding(SupportsShouldProcess)]
param()

$ErrorActionPreference = 'Stop'

$identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run this script from an Administrator PowerShell window."
}

$AppRoot    = (Get-Item $PSScriptRoot).Parent.Parent.FullName
$BackendDir = Join-Path $AppRoot 'backend'

Write-Host ''
Write-Host "Restricting access under $AppRoot" -ForegroundColor Cyan
Write-Host ''

# Well-known SIDs are used instead of names so the script works on a server with
# any display language.
$systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')      # NT AUTHORITY\SYSTEM
$adminsSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')  # BUILTIN\Administrators

function Protect-Path {
    param([Parameter(Mandatory)][string]$Path)

    if (-not (Test-Path $Path)) {
        Write-Host ('  {0,-46} skipped (not present)' -f (Split-Path $Path -Leaf)) -ForegroundColor DarkGray
        return
    }

    if (-not $PSCmdlet.ShouldProcess($Path, 'Restrict to SYSTEM and Administrators')) { return }

    $item = Get-Item $Path -Force
    $acl  = Get-Acl $item.FullName

    # Stop inheriting from the parent and drop the inherited entries, otherwise
    # BUILTIN\Users keeps read access through the copied ACEs.
    $acl.SetAccessRuleProtection($true, $false)
    foreach ($rule in @($acl.Access)) { [void]$acl.RemoveAccessRule($rule) }

    $inheritance = if ($item.PSIsContainer) { 'ContainerInherit, ObjectInherit' } else { 'None' }

    foreach ($sid in @($systemSid, $adminsSid)) {
        $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule(
            $sid, 'FullControl', $inheritance, 'None', 'Allow')))
    }

    $acl.SetOwner($adminsSid)
    Set-Acl -Path $item.FullName -AclObject $acl

    Write-Host ('  {0,-46} locked' -f (Split-Path $Path -Leaf)) -ForegroundColor Green
}

# Secrets and configuration
Protect-Path (Join-Path $BackendDir '.env')

# Source control metadata — a .git directory exposes the full history,
# including anything that was ever committed by mistake.
Protect-Path (Join-Path $AppRoot '.git')

# Application data
Protect-Path (Join-Path $BackendDir 'securetrack.db')
Protect-Path (Join-Path $BackendDir 'securetrack.db-wal')
Protect-Path (Join-Path $BackendDir 'securetrack.db-shm')
Protect-Path (Join-Path $BackendDir 'uploads')
Protect-Path (Join-Path $AppRoot 'backups')
Protect-Path (Join-Path $AppRoot 'logs')

# ── SMB exposure check ───────────────────────────────────────────────────────
Write-Host ''
Write-Host 'Checking for file shares that expose this folder' -ForegroundColor Cyan

$shares = @(Get-SmbShare -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -and $AppRoot.ToLower().StartsWith($_.Path.ToLower()) -and $_.Name -notlike '*$' })

if ($shares.Count) {
    Write-Host ''
    foreach ($s in $shares) {
        Write-Host "  WARNING: share '$($s.Name)' publishes $($s.Path)" -ForegroundColor Red
    }
    Write-Host ''
    Write-Host '  Anyone who can reach that share may be able to read the repository.' -ForegroundColor Red
    Write-Host "  Remove it with:  Remove-SmbShare -Name '<name>'" -ForegroundColor Red
} else {
    Write-Host '  No SMB share covers the application folder.' -ForegroundColor Green
}

# Administrative shares (C$, ADMIN$) still expose the disk to domain admins.
# That is normal on a domain member, but worth stating out loud.
Write-Host ''
Write-Host '  Note: administrative shares (C$) remain accessible to domain/local' -ForegroundColor Yellow
Write-Host '  administrators by design. Restrict who holds those rights.' -ForegroundColor Yellow

Write-Host ''
Write-Host 'Done. Re-run this script after every deployment or git pull.' -ForegroundColor Cyan
Write-Host ''
