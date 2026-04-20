@echo off
title VALHALLA SOC — Iniciando...
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════╗
echo  ║        VALHALLA SOC — STARTUP        ║
echo  ╚══════════════════════════════════════╝
echo.

echo [1/2] Levantando stack Wazuh + Cowrie (Docker)...
docker compose up -d
echo.

echo [2/2] Iniciando dashboard HUD en http://localhost:3000 ...
start "Valhalla HUD" cmd /k "cd /d "%~dp0backend" && node server.js"

timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo  Dashboard abierto en el navegador.
echo  Cierra la ventana "Valhalla HUD" para detener el servidor.
echo.
pause
