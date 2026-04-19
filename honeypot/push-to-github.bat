@echo off
REM =============================================================
REM  Valhalla SOC - Honeypot - Push a GitHub (doble click)
REM  Ejecuta el .ps1 sin abrir PowerShell a pelo.
REM =============================================================

pushd "%~dp0.."

echo.
echo  Repo: %CD%
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-to-github.ps1"
set EC=%ERRORLEVEL%

popd

echo.
if %EC% NEQ 0 (
    echo [X] Hubo un error. Revisa la salida arriba.
) else (
    echo [OK] Listo. Honeypot publicado en GitHub.
)
echo.
pause
