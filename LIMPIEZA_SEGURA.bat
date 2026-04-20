@echo off
chcp 65001 >nul
cls
echo.
echo ╔══════════════════════════════════════════════════════════════════╗
echo ║           LIMPIEZA SEGURA - Valhalla SOC                          ║
echo ║   Preserva backups, orientaciones y scripts maestros              ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.
echo ⚠️  ATENCION: Este script eliminara TODO el proyecto actual
echo    excepto archivos de backup, orientaciones y scripts maestros.
echo.
echo 📁 Archivos que SE CONSERVAN:
echo    - *.zip (backups con fecha)
echo    - ORIENTACIONES.md
echo    - LIMPIEZA_SEGURA.bat
echo    - instalar-y-ejecutar.bat
echo    - verificar-requisitos.bat
echo    - detener-todo.bat
echo.
echo 📁 Directorio actual: %cd%
echo.

set /p CONFIRMAR="¿Estas seguro? Escribe SI para continuar: "

if /I not "%CONFIRMAR%"=="SI" (
    echo ❌ Operacion cancelada por el usuario.
    pause
    exit /b 1
)

echo.
echo 🧹 Iniciando limpieza segura...
echo.

:: Crear directorio temporal para archivos a conservar
if not exist "_PRESERVAR_TEMP" mkdir "_PRESERVAR_TEMP"

:: Mover archivos a conservar al temporal
echo 📦 Guardando archivos importantes...

if exist "*.zip" (
    move "*.zip" "_PRESERVAR_TEMP\" >nul 2>&1
    echo    ✓ Backups ZIP movidos a temporal
)

if exist "ORIENTACIONES.md" (
    copy "ORIENTACIONES.md" "_PRESERVAR_TEMP\" >nul 2>&1
    echo    ✓ ORIENTACIONES.md copiado
)

if exist "LIMPIEZA_SEGURA.bat" (
    copy "LIMPIEZA_SEGURA.bat" "_PRESERVAR_TEMP\" >nul 2>&1
    echo    ✓ LIMPIEZA_SEGURA.bat copiado
)

if exist "instalar-y-ejecutar.bat" (
    copy "instalar-y-ejecutar.bat" "_PRESERVAR_TEMP\" >nul 2>&1
    echo    ✓ instalar-y-ejecutar.bat copiado
)

if exist "verificar-requisitos.bat" (
    copy "verificar-requisitos.bat" "_PRESERVAR_TEMP\" >nul 2>&1
    echo    ✓ verificar-requisitos.bat copiado
)

if exist "detener-todo.bat" (
    copy "detener-todo.bat" "_PRESERVAR_TEMP\" >nul 2>&1
    echo    ✓ detener-todo.bat copiado
)

echo.
echo 🗑️  Eliminando archivos del proyecto...

:: Lista de directorios a eliminar
for %%D in (
    "backend"
    "frontend"
    "config"
    "cowrie_config"
    "wazuh_config"
    "honeypot"
    "docs"
    "design_export"
    "Fotos de su funcionamiento en local"
    ".claude"
    ".playwright-mcp"
    ".remember"
    ".git"
) do (
    if exist %%D (
        rmdir /S /Q %%D 2>nul
        if exist %%D (
            echo    ⚠️  No se pudo eliminar %%D (posiblemente en uso)
        ) else (
            echo    ✓ Eliminado %%D
        )
    )
)

:: Eliminar archivos sueltos (excepto .bat y .md que no sean orientaciones)
for %%F in (
    ".env.example"
    ".gitignore"
    "Captura de pantalla 2026-04-17 170532.png"
    "create_dashboards.py"
    "docker-compose.yml"
    "guia-docker (1).md"
    "imagen.png"
    "iniciar-valhalla.bat"
    "MANUAL.md"
    "README.md"
    "setup_monitors.py"
    "setup_reports.py"
) do (
    if exist %%F (
        del /F /Q %%F 2>nul
        echo    ✓ Eliminado %%F
    )
)

echo.
echo 📤 Restaurando archivos conservados...

:: Mover archivos del temporal de vuelta
move "_PRESERVAR_TEMP\*.*" ".\" >nul 2>&1

:: Limpiar temporal
rmdir /S /Q "_PRESERVAR_TEMP" 2>nul

echo.
echo ╔══════════════════════════════════════════════════════════════════╗
echo ║                   ✅ LIMPIEZA COMPLETADA                          ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.
echo 📁 Archivos conservados en el directorio:
dir /B "*.bat" "*.md" "*.zip" 2>nul | findstr /V "^$"
echo.
echo 📝 Proximos pasos:
echo    1. Clonar el repositorio: git clone https://github.com/saantiidp/Valhalla-SOC.git .
echo    2. Ejecutar: instalar-y-ejecutar.bat
echo.
pause
