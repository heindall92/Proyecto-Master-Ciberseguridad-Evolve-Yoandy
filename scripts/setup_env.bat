@echo off
title Valhalla SOC - Configuracion inicial
cd /d "%~dp0\.."

where python >nul 2>&1
if errorlevel 1 (
  echo ERROR: Python no encontrado. Instale Python 3.11+ y vuelva a ejecutar.
  pause
  exit /b 1
)

python "%~dp0setup_env.py" %*
set EXIT_CODE=%ERRORLEVEL%
if %EXIT_CODE% neq 0 pause
exit /b %EXIT_CODE%
