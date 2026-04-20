@echo off
chcp 65001 >nul
cls
echo.
echo ╔══════════════════════════════════════════════════════════════════╗
echo ║            Detener Todos los Servicios - Valhalla SOC              ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.

:: ═══════════════════════════════════════════════════════════════
echo 🛑 Deteniendo procesos Node.js (Backend y Frontend)...
:: ═══════════════════════════════════════════════════════════════

echo    Buscando procesos node.exe...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo    ✅ Procesos Node.js detenidos
) else (
    echo    ℹ️  No se encontraron procesos Node.js corriendo
)

:: ═══════════════════════════════════════════════════════════════
echo.
echo 🐳 Deteniendo servicios Docker...
:: ═══════════════════════════════════════════════════════════════

docker info >nul 2>&1
if %ERRORLEVEL% equ 0 (
    if exist "docker-compose.yml" (
        echo    Deteniendo stack Wazuh + Cowrie...
        docker compose down
        if %ERRORLEVEL% equ 0 (
            echo    ✅ Stack Docker detenido
        ) else (
            echo    ⚠️  Error deteniendo Docker (puede que ya estuviera parado)
        )
    ) else (
        echo    ⚠️  No se encontro docker-compose.yml en este directorio
        echo       Buscando contenedores de Valhalla manualmente...
        docker stop wazuh.manager wazuh.indexer wazuh.dashboard cowrie >nul 2>&1
        echo    ✅ Contenedores detenidos (si existian)
    )
) else (
    echo    ℹ️  Docker no esta corriendo, omitiendo.
)

:: ═══════════════════════════════════════════════════════════════
echo.
echo 📋 Estado final:
:: ═══════════════════════════════════════════════════════════════
echo.

:: Verificar si quedo algo corriendo
docker ps --format "table {{.Names}}" | findstr /I "wazuh\|cowrie" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo    ⚠️  Algunos contenedores Docker siguen corriendo:
    docker ps --format "table {{.Names}}\t{{.Status}}" | findstr /I "wazuh\|cowrie"
) else (
    echo    ✅ Docker: Todos los servicios detenidos
)

tasklist | findstr /I "node.exe" >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo    ⚠️  Algunos procesos Node siguen corriendo:
    tasklist | findstr "node.exe"
) else (
    echo    ✅ Node.js: Todos los procesos detenidos
)

echo.
echo ╔══════════════════════════════════════════════════════════════════╗
echo ║               ✅ TODOS LOS SERVICIOS DETENIDOS                     ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.
echo Para volver a iniciar todo:
echo    instalar-y-ejecutar.bat
echo.
pause
