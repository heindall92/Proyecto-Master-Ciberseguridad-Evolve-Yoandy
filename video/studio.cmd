@echo off
rem Abre Remotion Studio (editor del video) en http://localhost:3100
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
npx remotion studio src/index.ts --port 3100 --no-open
