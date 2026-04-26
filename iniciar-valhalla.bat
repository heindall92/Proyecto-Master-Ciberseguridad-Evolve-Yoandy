@echo off
title VALHALLA SOC — Iniciando...
cd /d "%~dp0"

echo.
echo  ╔══════════════════════════════════════╗
echo  ║        VALHALLA SOC — STARTUP        ║
echo  ╚══════════════════════════════════════╝
echo.

echo [1/2] Levantando servicios (Docker: Wazuh, Postgres, Ollama, Cowrie)...
docker compose up -d wazuh.manager wazuh.indexer wazuh.dashboard postgres ollama cowrie
echo.

echo [2/2] Iniciando frontend (npm run dev)...
start "Valhalla Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo  Frontend: http://localhost:3000
echo  Backend API: http://localhost:8000
echo  Wazuh Dashboard: https://localhost:443
echo.
pause