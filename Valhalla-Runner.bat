@echo off
title Valhalla SOC Runner
cd /d "%~dp0"

echo [1/4] Comprobando configuracion inicial (.env)...
python scripts\setup_env.py
if errorlevel 1 (
  echo ERROR: No se pudo configurar .env. Revise el mensaje anterior.
  pause
  exit /b 1
)

echo [2/4] Levantando stack Docker (Wazuh, Cowrie, simulador de ataques labs)...
docker compose --profile labs up -d --build

echo [3/4] Iniciando Backend...
start "Valhalla Backend" /MIN cmd /c "cd /d "%~dp0backend" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --loop app.uvicorn_loop:selector_loop_factory"

echo [3/4] Iniciando Frontend...
if exist "%~dp0bg-login.png" copy /Y "%~dp0bg-login.png" "%~dp0frontend\app\public\bg-login.png" >nul
start "Valhalla Frontend" /MIN cmd /c "cd /d "%~dp0frontend" && npm run dev"

echo Esperando a que los servicios se inicialicen...
timeout /t 5 /nobreak >nul

echo [4/4] Abriendo Valhalla SOC...
:: Buscar Chrome o Edge para usar modo app
start msedge --app="http://localhost:3000" || start chrome --app="http://localhost:3000" || start http://localhost:3000

exit
