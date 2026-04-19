# ═══════════════════════════════════════════════════════════
# Valhalla SOC — Push del Honeypot a GitHub
# Pensado para Windows PowerShell. Ejecuta:
#   cd C:\Users\santi\Documents\Valhalla-SOC\honeypot
#   powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1
# ═══════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

# Subir al root del repo
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

Write-Host "→ Repo: $RepoRoot" -ForegroundColor Cyan

# 1) Quitar cualquier index.lock huérfano que haya quedado
$lock = Join-Path $RepoRoot ".git\index.lock"
if (Test-Path $lock) {
    Write-Host "→ Eliminando .git/index.lock huérfano..." -ForegroundColor Yellow
    Remove-Item -Force $lock
}

# 2) Normalizar line endings para que no entren 3000 líneas de ruido
Write-Host "→ Configurando core.autocrlf=true para Windows..." -ForegroundColor Cyan
git config core.autocrlf true

# 3) Stagear SOLO la carpeta honeypot/
Write-Host "→ Añadiendo honeypot/ al index..." -ForegroundColor Cyan
git add honeypot/

# 4) Mostrar qué se va a commitear
Write-Host ""
Write-Host "Archivos staged:" -ForegroundColor Green
git diff --cached --stat

# 5) Commit
$msg = @"
feat(honeypot): stack Cowrie standalone con export JSON

- docker-compose.yml independiente (solo Cowrie)
- cowrie.cfg con output_jsonlog activado (cowrie.json)
- userdb.txt con credenciales tipicas de bot (bait)
- Volumenes nombrados: valhalla_cowrie_logs (consumido por backend)
- Red externa 'valhalla-net' compartida con el backend FastAPI
- Scripts: start / stop / status / tail-logs / test-attack
- Makefile con atajos (make up / down / logs / status / test)
- README con arquitectura, formato JSON y como engancharlo al backend
"@

Write-Host ""
Write-Host "→ Creando commit..." -ForegroundColor Cyan
git commit -m $msg

# 6) Push
Write-Host ""
Write-Host "→ Push a origin/main..." -ForegroundColor Cyan
git push origin main

Write-Host ""
Write-Host "[OK] Honeypot publicado en GitHub." -ForegroundColor Green
Write-Host "     https://github.com/saantiidp/Valhalla-SOC/tree/main/honeypot" -ForegroundColor Green
