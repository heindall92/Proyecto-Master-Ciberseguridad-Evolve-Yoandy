@echo off
REM =============================================================
REM  Valhalla SOC - Honeypot - Simulacion de ataque (Windows)
REM  Doble-click para lanzarlo. Requiere Docker Desktop abierto
REM  y el honeypot Cowrie corriendo (ejecuta verificar.bat primero).
REM =============================================================

pushd "%~dp0"

echo.
echo  ====================================================
echo   Valhalla SOC - Honeypot - Simulacion de ataque
echo  ====================================================
echo.
echo   Esto va a:
echo     1) Levantar el contenedor Kali Linux (attacker)
echo     2) Instalar nmap, openssh-client, sshpass
echo     3) Ejecutar 14 tests desde Kali hacia Cowrie:
echo        - Ping, Nmap, Banner SSH
echo        - Login con credenciales debiles (aceptado)
echo        - Comandos en la shell falsa
echo        - Simulacion de wget de malware
echo        - Fuerza bruta con credenciales del userdb
echo        - Verificacion de logs generados
echo     4) Generar informe en docs/EVIDENCIA-ATTACK-[fecha].md
echo.
echo   Requisito: Cowrie debe estar corriendo.
echo   Si no lo esta, ejecuta primero verificar.bat
echo.
echo   Duracion: ~2-3 minutos
echo.
pause

powershell -NoProfile -ExecutionPolicy Bypass -File ".\scripts\attack_verify.ps1"

echo.
echo  ====================================================
echo   Simulacion terminada.
echo   Abre la carpeta docs/ para ver el informe EVIDENCIA-ATTACK-*.md
echo  ====================================================
echo.
pause
popd
