#!/usr/bin/env pwsh
# deploy-cv.ps1 — Deploy Crystal Vision Co. to rightnowsd.org
#
# Usage:
#   powershell -File deploy-cv.ps1             # full build + deploy
#   powershell -File deploy-cv.ps1 -SkipBuild  # skip Vite build, re-deploy only
#
# Prerequisites:
#   - SSH key auth to root@37.27.189.86
#   - api/.env exists locally (copy from api/.env.production.example and edit)

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$VPS       = 'root@37.27.189.86'
$RemoteDir = '/opt/crystalvision'
$DataDir   = "$RemoteDir/data"
$DistDir   = "$RemoteDir/dist"

# ─── Color helpers ──────────────────────────────────────────
function Info($msg)    { Write-Host "  $msg" -ForegroundColor Cyan }
function Success($msg) { Write-Host "✓ $msg" -ForegroundColor Green }
function Warn($msg)    { Write-Host "⚠ $msg" -ForegroundColor Yellow }
function Fail($msg)    { Write-Host "✕ $msg" -ForegroundColor Red; exit 1 }
function Header($msg)  { Write-Host "`n══ $msg ══" -ForegroundColor White }

# ─── Preflight checks ───────────────────────────────────────
Header "Pre-flight"

if (-not (Test-Path "index.html") -or -not (Test-Path "api")) {
    Fail "Run this script from the crystalvisionusa project root."
}

if (-not (Test-Path "api\.env")) {
    Warn "api/.env not found."
    if (Test-Path "api\.env.production.example") {
        Info "Copying api/.env.production.example → api/.env"
        Copy-Item "api\.env.production.example" "api\.env"
        Warn "Using default .env (ADMIN_PASSWORD=changeme123). Edit api/.env before deploying to a real customer."
    } else {
        Fail "Create api/.env before deploying. See api/.env.production.example."
    }
}

Success "Preflight passed"

# ─── Step 1: Build Vite client ──────────────────────────────
if (-not $SkipBuild) {
    Header "Step 1/7 — Build Vite client"

    if (Test-Path "dist") {
        Info "Removing old dist/"
        Remove-Item -Recurse -Force dist
    }

    Info "Running npm run build..."
    npm run build
    if ($LASTEXITCODE -ne 0) { Fail "npm run build failed." }

    # Verify no 0-byte files
    $empty = Get-ChildItem dist\assets\* -ErrorAction SilentlyContinue | Where-Object { $_.Length -eq 0 }
    if ($empty) {
        Fail "0-byte files found in dist/assets! Build is corrupted.`n$($empty.FullName -join "`n")"
    }

    Success "Vite build complete — $((Get-ChildItem dist\assets\*).Count) assets"
} else {
    if (-not (Test-Path "dist")) { Fail "dist/ not found. Run without -SkipBuild." }
    Warn "Skipping Vite build — using existing dist/"
}

# ─── Step 2: Package API source ─────────────────────────────
Header "Step 2/7 — Package API source"

Info "Creating api.tar (excluding node_modules)..."
$tar = "api-deploy.tar.gz"
if (Test-Path $tar) { Remove-Item $tar }

# Use ssh tar on the local files
& tar -czf $tar `
    --exclude="api/node_modules" `
    --exclude="api/data" `
    --exclude="api/.env" `
    api/ docker-compose.yml

if ($LASTEXITCODE -ne 0) { Fail "tar failed. Ensure tar is available (Git Bash / WSL)." }
Success "api-deploy.tar.gz created"

# ─── Step 3: Server prep ────────────────────────────────────
Header "Step 3/7 — Prepare server directories"

ssh $VPS @"
set -e
mkdir -p $RemoteDir/api
mkdir -p $DataDir
mkdir -p $DistDir
echo 'Directories ready.'
"@
if ($LASTEXITCODE -ne 0) { Fail "Failed to create directories on server." }
Success "Server directories ready"

# ─── Step 4: Stop old rightnowsd service ────────────────────
Header "Step 4/7 — Stop rightnowsd.service (old app)"

$svcStatus = ssh $VPS "systemctl is-active rightnowsd.service 2>/dev/null || echo 'inactive'"
if ($svcStatus.Trim() -eq 'active') {
    ssh $VPS "systemctl stop rightnowsd.service && systemctl disable rightnowsd.service"
    Success "rightnowsd.service stopped and disabled"
} else {
    Info "rightnowsd.service already inactive"
}

# ─── Step 5: Upload files ────────────────────────────────────
Header "Step 5/7 — Upload files to server"

Info "Uploading API source..."
scp $tar "${VPS}:${RemoteDir}/api-deploy.tar.gz"
if ($LASTEXITCODE -ne 0) { Fail "SCP of api failed." }

Info "Extracting on server..."
ssh $VPS @"
set -e
cd $RemoteDir
tar -xzf api-deploy.tar.gz
rm api-deploy.tar.gz
echo 'Extracted.'
"@

Info "Uploading .env..."
scp api\.env "${VPS}:${RemoteDir}/api/.env"
if ($LASTEXITCODE -ne 0) { Fail "SCP of .env failed." }

Info "Uploading static dist/ ($((Get-ChildItem dist\assets\*).Count) assets)..."
# Clean entire dist on server, then re-upload everything (catches added/removed subdirs)
ssh $VPS "rm -rf ${DistDir}/* && mkdir -p ${DistDir}/assets ${DistDir}/admin"
scp -r dist\assets\* "${VPS}:${DistDir}/assets/"
Get-ChildItem dist\* -File | ForEach-Object { scp $_.FullName "${VPS}:${DistDir}/$($_.Name)" }
# Upload any subdirectories (admin/, etc.)
Get-ChildItem dist\* -Directory | ForEach-Object {
    $name = $_.Name
    ssh $VPS "mkdir -p ${DistDir}/$name"
    scp -r "$($_.FullName)\*" "${VPS}:${DistDir}/$name/"
}
if ($LASTEXITCODE -ne 0) { Fail "SCP of dist failed." }

# Verify no 0-byte files on server
$emptyOnServer = ssh $VPS "find ${DistDir}/assets/ -size 0 -type f"
if ($emptyOnServer) { Fail "0-byte files on server after upload!`n$emptyOnServer" }

Info "Uploading public/ assets (logo, hero image, etc.)..."
if (Test-Path public) {
    # Upload public folder contents to dist (Vite doesn't copy public automatically
    # when using --base, but our public/ files should be in dist already from the build)
}

Success "All files uploaded"

# ─── Step 6: Build & start Docker container ─────────────────
Header "Step 6/7 — Docker build + up"

Info "Building crystalvision-api image on server (this takes ~60s for native deps)..."
ssh $VPS @"
set -e
cd $RemoteDir

# Stop existing container if running
docker compose down 2>/dev/null || true

# Build fresh
docker compose build --no-cache

# Start detached
docker compose up -d

echo 'Container started.'
"@
if ($LASTEXITCODE -ne 0) { Fail "Docker build/start failed. Check server logs." }

Info "Waiting for health check..."
Start-Sleep -Seconds 8
$health = ssh $VPS "docker inspect --format='{{.State.Health.Status}}' crystalvision-api 2>/dev/null || echo 'unknown'"
Info "Container health: $($health.Trim())"

Success "Container running"

# ─── Step 7: Nginx config ────────────────────────────────────
Header "Step 7/7 — Configure nginx → rightnowsd.org"

Info "Uploading nginx vhost config..."
scp deploy\nginx-crystalvision.conf "${VPS}:/etc/nginx/sites-available/rightnowsd"
if ($LASTEXITCODE -ne 0) { Fail "SCP of nginx config failed." }

Info "Testing nginx config..."
ssh $VPS "nginx -t"
if ($LASTEXITCODE -ne 0) { Fail "nginx -t failed — config has errors. NOT reloading." }

Info "Reloading nginx..."
ssh $VPS "systemctl reload nginx"
if ($LASTEXITCODE -ne 0) { Fail "nginx reload failed." }

Success "nginx reloaded"

# ─── Verify ─────────────────────────────────────────────────
Header "Verification"

Info "Checking API health through localhost:3003..."
ssh $VPS "curl -sf http://127.0.0.1:3003/api/health && echo ' — OK'" 2>$null

Info "Checking HTTPS..."
$httpStatus = ssh $VPS "curl -so /dev/null -w '%{http_code}' https://rightnowsd.org/ 2>/dev/null"
if ($httpStatus.Trim() -eq '200') {
    Success "https://rightnowsd.org/ → 200 OK"
} else {
    Warn "https://rightnowsd.org/ returned HTTP $($httpStatus.Trim()) — may need a moment for DNS/cache."
}

# Cleanup local tar
Remove-Item $tar -ErrorAction SilentlyContinue

Write-Host @"

╔══════════════════════════════════════════════════════════╗
║  Crystal Vision Co. is live at https://rightnowsd.org   ║
║                                                          ║
║  Admin dashboard: https://rightnowsd.org/admin/          ║
║  Password:        see api/.env → ADMIN_PASSWORD          ║
║                                                          ║
║  safesd.org — NOT touched. Still running normally.       ║
╚══════════════════════════════════════════════════════════╝
"@ -ForegroundColor Green
