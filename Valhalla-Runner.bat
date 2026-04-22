@echo off
title Valhalla SOC Runner
cd /d "%~dp0"

echo Levantando stack Docker (Wazuh, Cowrie)...
docker compose up -d

echo Iniciando Backend...
start "Valhalla Backend" /MIN cmd /c "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

echo Iniciando Frontend...
start "Valhalla Frontend" /MIN cmd /c "cd /d "%~dp0frontend" && npm run dev"

echo Esperando a que los servicios se inicialicen...
timeout /t 5 /nobreak >nul

echo Abriendo Valhalla SOC...
:: Buscar Chrome o Edge para usar modo app
start msedge --app="http://localhost:3000" || start chrome --app="http://localhost:3000" || start http://localhost:3000

exit
