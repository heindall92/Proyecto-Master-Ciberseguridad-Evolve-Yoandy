@echo off
rem Render final del video (1080p, grabaciones originales). Se ejecuta como proceso independiente.
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"
for /f "delims=" %%p in ('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path','Machine')"') do set "PATH=%PATH%;%%p"
call npx remotion render src/index.ts ValhallaSOC out/Valhalla_SOC_Practica3_1080p.mp4 --props=build/props_final.json --concurrency=6 --crf=18 --log=info > build\render.log 2>&1
echo FIN %ERRORLEVEL% >> build\render.log
