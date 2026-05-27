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
Write-Step "1/5" "Comprobando prerrequisitos"

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
Write-Step "2/5" "Preparando el repositorio"

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
Write-Step "3/5" "Configurando secretos (.env)"

if (Test-Path ".env") {
    Write-OK ".env ya existe — no se sobreescribe (usa --Force para regenerar)"
} else {
    python scripts\setup_env.py --yes
    Write-OK ".env generado con secretos únicos"
}

# ── 4. Levantar el stack con Docker Compose ──────────────────────────────────
Write-Step "4/5" "Levantando el stack Docker"

$profile = if ($NoLabs) { "" } else { "--profile labs" }
$cmd = "docker compose $profile up -d --build"

Write-Host "      > $cmd" -ForegroundColor Gray
Invoke-Expression $cmd

Write-OK "Todos los contenedores iniciados"

# ── 5. Modelo IA (Ollama) ────────────────────────────────────────────────────
Write-Step "5/5" "Descargando modelo de IA ($OLLAMA_MODEL)"

if ($SkipOllama) {
    Write-Warn "Saltando descarga del modelo (--SkipOllama). El chatbot IA no funcionará hasta que lo descargues."
} else {
    Write-Host "      Esperando a que Ollama arranque..." -ForegroundColor Gray
    $tries = 0
    do {
        Start-Sleep -Seconds 3
        $tries++
        $ready = docker exec ollama ollama list 2>$null
    } while (-not $ready -and $tries -lt 20)

    if ($ready) {
        docker exec ollama ollama pull $OLLAMA_MODEL
        Write-OK "Modelo $OLLAMA_MODEL descargado"
    } else {
        Write-Warn "Ollama tardó demasiado en arrancar. Ejecuta manualmente: docker exec ollama ollama pull $OLLAMA_MODEL"
    }
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
