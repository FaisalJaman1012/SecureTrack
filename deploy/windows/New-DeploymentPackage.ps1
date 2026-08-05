<#
.SYNOPSIS
    Builds a self-contained offline deployment package for SecureTrack.

.DESCRIPTION
    RUN THIS ON A MACHINE THAT HAS INTERNET — a laptop or a staging box, not the
    production server.

    It clones or updates the repository, installs both dependency trees, builds
    the React client, and zips the result. The resulting ZIP contains everything
    the production server needs: source, node_modules (with the compiled
    better-sqlite3 binary) and the finished frontend build. Nothing inside it
    reaches the network at install time.

    Copy the ZIP to the air-gapped server on approved media, then apply it with:
        .\Update-SecureTrack.ps1 -PackagePath C:\Temp\securetrack-<date>.zip

    The package deliberately contains no .env, no database and no uploads —
    production data and secrets never leave the server.

.PARAMETER RepoUrl
    Git URL to clone when -SourcePath is not given.

.PARAMETER SourcePath
    Use an existing local checkout instead of cloning.

.PARAMETER Branch
    Branch to build. Defaults to the repository's current/default branch.

.PARAMETER OutputDir
    Where to write the ZIP. Defaults to the current directory.

.EXAMPLE
    .\New-DeploymentPackage.ps1 -RepoUrl https://github.com/swarupsro/SecureTrackProd.git
    .\New-DeploymentPackage.ps1 -SourcePath C:\dev\SecureTrackProd -Branch main
#>
[CmdletBinding()]
param(
    [string]$RepoUrl,
    [string]$SourcePath,
    [string]$Branch,
    [string]$OutputDir = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }

if (-not $RepoUrl -and -not $SourcePath) {
    throw "Give either -RepoUrl (to clone) or -SourcePath (an existing checkout)."
}

foreach ($tool in @('node.exe', 'npm.cmd')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "$tool not found on PATH. Install Node.js 20 LTS (x64) on this build machine."
    }
}
Write-Step "Build machine Node: $(& node --version)"

# ── Get the source ───────────────────────────────────────────────────────────
$staging = Join-Path ([IO.Path]::GetTempPath()) ("securetrack-build-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))

if ($SourcePath) {
    Write-Step "Copying source from $SourcePath"
    if (-not (Test-Path $SourcePath)) { throw "Not found: $SourcePath" }
    New-Item -ItemType Directory -Path $staging -Force | Out-Null
    # Skip anything that must not travel: secrets, data, previous builds
    robocopy $SourcePath $staging /E /NFL /NDL /NJH /NJS /NP `
        /XD node_modules build uploads backups logs .git `
        /XF .env *.db *.db-wal *.db-shm | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE." }
} else {
    Write-Step "Cloning $RepoUrl"
    if (-not (Get-Command git.exe -ErrorAction SilentlyContinue)) { throw "git.exe not found on PATH." }
    if ($Branch) { git clone --depth 1 --branch $Branch $RepoUrl $staging }
    else         { git clone --depth 1 $RepoUrl $staging }
    if ($LASTEXITCODE -ne 0) { throw "git clone failed." }
    Remove-Item (Join-Path $staging '.git') -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Ok "Source staged at $staging"

# ── Install and build ────────────────────────────────────────────────────────
Write-Step 'Installing backend dependencies (production only)'
Push-Location (Join-Path $staging 'backend')
try {
    npm ci --omit=dev
    if ($LASTEXITCODE -ne 0) { throw 'Backend npm ci failed.' }
} finally { Pop-Location }
Write-Ok 'Backend node_modules ready (includes the native better-sqlite3 binary)'

Write-Step 'Installing frontend dependencies and building the client'
Push-Location (Join-Path $staging 'frontend')
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend npm ci failed.' }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
} finally { Pop-Location }

# The frontend build output is what ships; its node_modules is build-time only
# and would triple the package size.
Remove-Item (Join-Path $staging 'frontend\node_modules') -Recurse -Force
Write-Ok 'Client built'

# ── Verify the build really is offline-safe ──────────────────────────────────
Write-Step 'Verifying the build makes no external requests'
$buildDir = Join-Path $staging 'frontend\build'
$offenders = Get-ChildItem $buildDir -Recurse -Include *.js, *.css, *.html |
             Select-String -Pattern 'fonts\.googleapis\.com|fonts\.gstatic\.com|//cdn\.' -List

if ($offenders) {
    foreach ($o in $offenders) { Write-Host "    $($o.Path)" -ForegroundColor Red }
    throw "The build references an external host. It would fail on the air-gapped server."
}
Write-Ok 'No CDN references — safe for an isolated network'

# ── Zip ──────────────────────────────────────────────────────────────────────
Write-Step 'Creating the package'
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
$stamp = Get-Date -Format 'yyyy-MM-dd_HH-mm'
$zip = Join-Path $OutputDir "securetrack-$stamp.zip"

Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zip -CompressionLevel Optimal -Force

Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue

$mb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host ''
Write-Host '========================================================' -ForegroundColor Green
Write-Host ' Offline package ready' -ForegroundColor Green
Write-Host '========================================================' -ForegroundColor Green
Write-Host ''
Write-Host "  File : $zip"
Write-Host "  Size : $mb MB"
Write-Host ''
Write-Host '  On the production server:'
Write-Host "      .\Update-SecureTrack.ps1 -PackagePath '<copied path>'"
Write-Host ''
Write-Host '  The database, uploads and backend\.env on the server are preserved.' -ForegroundColor Yellow
Write-Host ''
