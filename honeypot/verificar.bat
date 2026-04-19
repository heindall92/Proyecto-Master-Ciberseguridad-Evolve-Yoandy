@echo off
REM =============================================================
REM  Valhalla SOC - Honeypot - Verificacion automatica (Windows)
REM  Doble-click para lanzarlo. Requiere Docker Desktop abierto.
REM =============================================================

pushd "%~dp0"

echo.
echo  ====================================================
echo   Valhalla SOC - Honeypot - Verificacion automatica
echo  ====================================================
echo.
echo   Esto va a:
echo     1) Bajar la imagen cowrie/cowrie (~200 MB primera vez)
echo     2) Arrancar el honeypot
echo     3) Ejecutar 15 tests automaticos
echo     4) Simular ataques SSH (con credenciales tipicas)
echo     5) Generar informe en docs/EVIDENCIA-[fecha].md
echo.
echo   Duracion: ~2-3 minutos
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\verify.ps1"

echo.
echo  ====================================================
echo   Verificacion terminada.
echo   Abre la carpeta docs/ para ver el informe EVIDENCIA-*.md
echo  ====================================================
echo.
pause
popd
