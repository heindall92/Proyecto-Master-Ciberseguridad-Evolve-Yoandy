# ═══════════════════════════════════════════════════════════════════════════════
# Valhalla SOC — Instalador para Windows
#
# Uso (one-liner):
#   irm https://raw.githubusercontent.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy/main/install.ps1 | iex
#
# O si ya tienes el repo clonado, ejecuta directamente:
#   .\install.ps1
# ═══════════════════════════════════════════════════════════════════════════════
[CmdletBinding()]
param(
    [string]$InstallDir = "$HOME\Valhalla-SOC",
    [switch]$SkipOllama,
    [switch]$NoLabs
)

$ErrorActionPreference = "Stop"
$REPO_URL = "https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy.git"
$OLLAMA_MODEL = "qwen2.5:3b-instruct"

function Write-Step([string]$n, [string]$msg) {
    Write-Host ""
    Write-Host "  [$n] $msg" -ForegroundColor Cyan
    Write-Host "  " + ("─" * 60) -ForegroundColor DarkGray
}

function Write-OK([string]$msg)  { Write-Host "      OK  $msg" -ForegroundColor Green }
function Write-Warn([string]$msg){ Write-Host "    WARN  $msg" -ForegroundColor Yellow }
function Write-Fail([string]$msg){ Write-Host "   ERROR  $msg" -ForegroundColor Red; exit 1 }

# ── Banner ────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════╗" -ForegroundColor DarkCyan
Write-Host "  ║         VALHALLA SOC  Installer       ║" -ForegroundColor Cyan
Write-Host "  ║    SOC con IA local · 100% Docker     ║" -ForegroundColor DarkCyan
Write-Host "  ╚═══════════════════════════════════════╝" -ForegroundColor DarkCyan
Write-Host ""

# ── 1. Prerrequisitos ─────────────────────────────────────────────────────────
Write-Step "1/7" "Comprobando prerrequisitos"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Fail "Git no encontrado. Instálalo desde https://git-scm.com/download/win y vuelve a ejecutar."
}
Write-OK "Git $(git --version)"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Write-Fail "Docker no encontrado. Instala Docker Desktop desde https://www.docker.com/products/docker-desktop/ y vuelve a ejecutar."
}
Write-OK "Docker $(docker --version)"

try { docker info 2>$null | Out-Null } catch {
    Write-Fail "Docker Desktop no está en ejecución. Ábrelo y vuelve a intentarlo."
}
Write-OK "Docker Desktop en ejecución"

if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Fail "Python 3 no encontrado. Instálalo desde https://www.python.org/downloads/ (marca 'Add to PATH')."
}
$pyver = python --version 2>&1
if ($pyver -notmatch "Python 3") { Write-Fail "Se requiere Python 3, encontrado: $pyver" }
Write-OK "$pyver"

# ── 2. Clonar o actualizar el repo ───────────────────────────────────────────
Write-Step "2/7" "Preparando el repositorio"

$alreadyInRepo = Test-Path (Join-Path $PSScriptRoot ".git")

if ($alreadyInRepo) {
    $InstallDir = $PSScriptRoot
    Write-OK "Ejecutando desde el repo en: $InstallDir"
} elseif (Test-Path (Join-Path $InstallDir ".git")) {
    Write-OK "Repo ya existe en $InstallDir — actualizando"
    Set-Location $InstallDir
    git pull --ff-only
} else {
    Write-Host "      Clonando en $InstallDir ..." -ForegroundColor Gray
    git clone $REPO_URL $InstallDir
    Set-Location $InstallDir
    Write-OK "Repo clonado"
}

Set-Location $InstallDir

# ── 3. Generar .env con secretos únicos ──────────────────────────────────────
Write-Step "3/7" "Configurando secretos (.env)"

if (Test-Path ".env") {
    Write-OK ".env ya existe — no se sobreescribe (usa --Force para regenerar)"
} else {
    python scripts\setup_env.py --yes
    Write-OK ".env generado con secretos únicos"
}

# ── 4. Certificados TLS de Wazuh ─────────────────────────────────────────────
Write-Step "4/7" "Generando certificados de Wazuh"
# No se versionan (son secretos): cada instalación crea los suyos
$certDir = Join-Path (Get-Location) "config\wazuh_indexer_ssl_certs"
if (Test-Path (Join-Path $certDir "root-ca.pem")) {
    Write-OK "Certificados ya presentes"
} else {
    New-Item -ItemType Directory -Force $certDir | Out-Null
    $cfg = Join-Path (Get-Location) "config\certs.yml"
    docker run --rm -v "${cfg}:/config/certs.yml:ro" -v "${certDir}:/certificates/" wazuh/wazuh-certs-generator:0.0.2
    # Permisos: el manager (uid 999) lee los suyos; el CA legible para el conector del indexador
    docker run --rm -v "${certDir}:/c" alpine:3.20 sh -c "chown 1000:1000 /c/* && chown 999:999 /c/wazuh.manager* /c/root-ca-manager* 2>/dev/null; chmod 400 /c/* && chmod 644 /c/root-ca.pem"
    Write-OK "Certificados en config\wazuh_indexer_ssl_certs\"
}

# ── 5. Levantar el stack con Docker Compose ──────────────────────────────────
Write-Step "5/7" "Levantando el stack Docker"

$profile = if ($NoLabs) { "" } else { "--profile labs" }
$cmd = "docker compose $profile up -d --build"

Write-Host "      > $cmd" -ForegroundColor Gray
Invoke-Expression $cmd

Write-OK "Todos los contenedores iniciados"

# ── 6. Modelo IA (Ollama) ────────────────────────────────────────────────────
Write-Step "6/7" "Modelo de IA ($OLLAMA_MODEL)"

if ($SkipOllama) {
    Write-Warn "Saltando el modelo (--SkipOllama). El asistente IA no funcionará hasta que lo descargues."
} else {
    # El servicio ollama-init lo descarga solo; aquí se espera a que termine
    Write-Host "      Esperando a ollama-init (descarga de ~2 GB la primera vez)..." -ForegroundColor Gray
    docker compose wait ollama-init 2>$null | Out-Null
    docker compose exec -T ollama ollama show $OLLAMA_MODEL 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-OK "Modelo $OLLAMA_MODEL disponible"
    } else {
        Write-Warn "El modelo aún no está. Ejecuta: docker compose exec ollama ollama pull $OLLAMA_MODEL"
    }
}

# ── 7. Wazuh: credenciales del indexador ─────────────────────────────────────
Write-Step "7/7" "Configurando el conector de vulnerabilidades de Wazuh"
$envLines = Get-Content .env
$idxUser = (($envLines | Where-Object { $_ -match '^OPENSEARCH_USER=' }) -replace '^OPENSEARCH_USER=', '') | Select-Object -Last 1
if (-not $idxUser) { $idxUser = "admin" }
$idxPass = (($envLines | Where-Object { $_ -match '^INDEXER_PASSWORD=' }) -replace '^INDEXER_PASSWORD=', '') | Select-Object -Last 1
$ready = $false
for ($i = 0; $i -lt 60 -and -not $ready; $i++) {
    docker compose exec -T wazuh.manager test -x /var/ossec/bin/wazuh-keystore 2>$null
    if ($LASTEXITCODE -eq 0) { $ready = $true } else { Start-Sleep -Seconds 5 }
}
if ($ready -and $idxPass) {
    # Como argumento: la tubería de PowerShell añadiría un salto de línea al valor.
    # (install.sh / wazuh_post_install.sh lo pasan por stdin, fuera de la línea de comandos)
    docker compose exec -T wazuh.manager /var/ossec/bin/wazuh-keystore -f indexer -k username -v $idxUser
    docker compose exec -T wazuh.manager /var/ossec/bin/wazuh-keystore -f indexer -k password -v $idxPass
    docker compose restart wazuh.manager | Out-Null
    Write-OK "Keystore del manager configurado"
} else {
    Write-Warn "Manager no disponible todavía. Repite: bash scripts/wazuh_post_install.sh"
}

# ── Resumen ───────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ╔═══════════════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "  ║           VALHALLA SOC  instalado con éxito           ║" -ForegroundColor Green
Write-Host "  ╚═══════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "  Panel SOC:         http://localhost:3000" -ForegroundColor White
Write-Host "  Wazuh Dashboard:   https://localhost (admin / admin)" -ForegroundColor White
Write-Host "  API Backend:       http://localhost:8000/docs" -ForegroundColor White
Write-Host "  Cowrie Honeypot:   SSH puerto 2222" -ForegroundColor White
Write-Host ""
Write-Host "  Credenciales admin SOC: ver .env → ADMIN_PASSWORD" -ForegroundColor DarkGray
Write-Host "  Para parar todo: docker compose down" -ForegroundColor DarkGray
Write-Host ""
