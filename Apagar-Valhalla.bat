@echo off
title Apagando Valhalla SOC...
cd /d "%~dp0"

echo Deteniendo contenedores Docker...
docker compose down

echo Matando procesos en segundo plano...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM uvicorn.exe >nul 2>&1
taskkill /F /IM python.exe /FI "WINDOWTITLE eq Valhalla Backend*" >nul 2>&1

echo.
echo Valhalla SOC apagado correctamente.
timeout /t 3 /nobreak >nul
exit
