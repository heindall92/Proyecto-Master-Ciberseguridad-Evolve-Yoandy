@echo off
chcp 65001 >nul
cls
echo.
echo ╔══════════════════════════════════════════════════════════════════╗
echo ║              Verificacion de Requisitos - Valhalla SOC             ║
echo ║                       (Solo diagnostico)                           ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.
echo ℹ️  Este script verifica que todas las herramientas esten instaladas.
echo    No instala nada automaticamente.
echo.

set "TODO_OK=1"

:: ═══════════════════════════════════════════════════════════════
echo.
echo 🔍 VERIFICANDO HERRAMIENTAS
:: ═══════════════════════════════════════════════════════════════
echo.

:: Docker
echo [1/5] Docker Desktop...
docker --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    ❌ NO instalado
    echo    📥 Descargar: https://www.docker.com/products/docker-desktop
    set "TODO_OK=0"
) else (
    for /f "tokens=3" %%a in ('docker --version') do echo    ✅ Version: %%a
    docker info >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo    ⚠️  Docker instalado pero NO corriendo
        echo       Por favor inicia Docker Desktop manualmente.
        set "TODO_OK=0"
    ) else (
        echo    ✅ Servicio activo
    )
)

:: Python
echo.
echo [2/5] Python...
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    py --version >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo    ❌ NO instalado
        echo    📥 Descargar: https://www.python.org/downloads/ (3.12 recomendado)
        set "TODO_OK=0"
    ) else (
        echo    ✅ Disponible via 'py' launcher
    )
) else (
    for /f "tokens=2" %%a in ('python --version') do echo    ✅ Version: %%a
)

:: Node.js
echo.
echo [3/5] Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    ❌ NO instalado
    echo    📥 Descargar: https://nodejs.org/ (LTS recomendado)
    set "TODO_OK=0"
) else (
    for /f "tokens=1" %%a in ('node --version') do echo    ✅ Version: %%a
    npm --version >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo    ⚠️  npm NO encontrado
        set "TODO_OK=0"
    ) else (
        for /f "tokens=1" %%a in ('npm --version') do echo    ✅ npm: %%a
    )
)

:: Git
echo.
echo [4/5] Git...
git --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    ❌ NO instalado
    echo    📥 Descargar: https://git-scm.com/downloads
    set "TODO_OK=0"
) else (
    for /f "tokens=3" %%a in ('git --version') do echo    ✅ Version: %%a
)

:: ═══════════════════════════════════════════════════════════════
echo.
echo 🔍 VERIFICANDO REPOSITORIO
:: ═══════════════════════════════════════════════════════════════
echo.

echo [5/5] Archivos del proyecto...
if not exist ".git" (
    echo    ❌ No es un repositorio Git
    echo       Clona con: git clone https://github.com/saantiidp/Valhalla-SOC.git
    set "TODO_OK=0"
) else (
    echo    ✅ Repositorio Git encontrado
)

if not exist "docker-compose.yml" (
    echo    ❌ No se encontro docker-compose.yml
    set "TODO_OK=0"
) else (
    echo    ✅ docker-compose.yml encontrado
)

if not exist "backend" (
    echo    ❌ No se encontro directorio backend/
    set "TODO_OK=0"
) else (
    echo    ✅ Directorio backend/ encontrado
)

if not exist "frontend" (
    echo    ❌ No se encontro directorio frontend/
    set "TODO_OK=0"
) else (
    echo    ✅ Directorio frontend/ encontrado
)

:: ═══════════════════════════════════════════════════════════════
echo.
echo 🔍 VERIFICANDO SERVICIOS DOCKER (si Docker esta corriendo)
:: ═══════════════════════════════════════════════════════════════
echo.

docker info >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo Contenedores de Valhalla SOC:
    docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | findstr /I "wazuh\|cowrie" 2>nul
    if %ERRORLEVEL% neq 0 (
        echo    ℹ️  No hay contenedores de Valhalla SOC corriendo aun.
        echo       Ejecuta: instalar-y-ejecutar.bat para iniciarlos.
    )
) else (
    echo    ⚠️  Docker no esta corriendo, no se pueden verificar contenedores.
)

:: ═══════════════════════════════════════════════════════════════
echo.
:: Resumen final
echo ═══════════════════════════════════════════════════════════════
if "%TODO_OK%"=="1" (
    echo.
    echo ╔══════════════════════════════════════════════════════════╗
    echo ║              ✅ TODO LISTO PARA INICIAR                  ║
    echo ╚══════════════════════════════════════════════════════════╝
    echo.
    echo 🚀 Puedes ejecutar: instalar-y-ejecutar.bat
) else (
    echo.
    echo ╔══════════════════════════════════════════════════════════╗
    echo ║    ⚠️  FALTAN ALGUNAS HERRAMIENTAS POR INSTALAR          ║
    echo ╚══════════════════════════════════════════════════════════╝
    echo.
    echo 📋 Instala las herramientas marcadas con ❌ arriba.
    echo    Despues vuelve a ejecutar este script.
)
echo.
pause
