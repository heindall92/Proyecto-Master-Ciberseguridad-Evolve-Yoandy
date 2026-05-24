@echo off
REM Punto de entrada: configurar secretos y levantar el stack
cd /d "%~dp0"
call scripts\setup_env.bat
if errorlevel 1 exit /b 1
call Valhalla-Runner.bat
