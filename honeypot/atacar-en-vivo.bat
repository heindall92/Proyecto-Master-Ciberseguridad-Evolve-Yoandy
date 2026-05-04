@echo off
REM =============================================================
REM  Valhalla SOC - Honeypot - Ataque en vivo
REM  Abre dos ventanas:
REM    - Esta: lanza el ataque paso a paso desde Kali
REM    - Nueva: tail -f del cowrie.json en tiempo real
REM =============================================================

pushd "%~dp0"

echo.
echo  ====================================================
echo   Valhalla SOC - Ataque en vivo
echo  ====================================================
echo.
echo   Se abriran DOS ventanas:
echo     1) Esta ventana  -> ejecuta el ataque (Kali)
echo     2) Ventana nueva -> logs de Cowrie en tiempo real
echo.
echo   Mira ambas a la vez para ver como Cowrie
echo   captura cada conexion, login y comando.
echo.
echo   Requisito: Docker Desktop abierto.
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\live_attack.ps1"

echo.
pause
popd
