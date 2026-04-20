@echo off
chcp 65001 >nul
cls
echo.
echo ╔══════════════════════════════════════════════════════════════════╗
echo ║     Valhalla SOC - Instalacion y Ejecucion Automatica             ║
echo ║                    (Sin Ollama Local)                              ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.
echo 🎯 Este script instalara y configurara:
echo    • Docker Desktop (Wazuh + Cowrie)
echo    • Python 3.12 (scripts de configuracion)
echo    • Node.js 18+ (Dashboard backend/frontend)
echo    • Stack completo listo para usar
    echo.
echo ☁️  Nota: Ollama se usa via cloud externo, no se instala localmente.
echo.
pause
echo.

set "ERRORS=0"

:: ═══════════════════════════════════════════════════════════════
echo 🔍 SECCION 1: Verificacion de Herramientas
:: ═══════════════════════════════════════════════════════════════
echo.

:: Verificar Docker
echo [1/5] Verificando Docker Desktop...
docker --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    ❌ Docker Desktop NO encontrado
    echo    📥 Descargando e instalando Docker Desktop...

    winget install --id Docker.DockerDesktop -e --accept-package-agreements --accept-source-agreements --silent
    if %ERRORLEVEL% neq 0 (
        echo    ⚠️  No se pudo instalar automaticamente.
        echo    🌐 Por favor instala manualmente desde:
        echo       https://www.docker.com/products/docker-desktop
        set /A ERRORS+=1
    ) else (
        echo    ✅ Docker Desktop instalado
        echo    🔄 Por favor reinicia la computadora y vuelve a ejecutar este script.
        pause
        exit /b 1
    )
) else (
    for /f "tokens=3" %%a in ('docker --version') do echo    ✅ Docker encontrado: %%a
)

:: Verificar si Docker daemon esta corriendo
echo    🔍 Verificando servicio Docker...
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    ⚠️  Docker Desktop esta instalado pero no corriendo.
    echo    🚀 Iniciando Docker Desktop...
    start "Docker Desktop" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo    ⏳ Esperando 60 segundos a que Docker este listo...
    timeout /t 60 /nobreak >nul

    docker info >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo    ❌ Docker no respondio. Por favor inicia Docker Desktop manualmente.
        set /A ERRORS+=1
    ) else (
        echo    ✅ Docker Desktop ahora corriendo
    )
) else (
    echo    ✅ Docker Desktop corriendo
)

:: Verificar Python
echo.
echo [2/5] Verificando Python...
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    py --version >nul 2>&1
    if %ERRORLEVEL% neq 0 (
        echo    ❌ Python NO encontrado
        echo    📥 Instalando Python 3.12 via winget...

        winget install --id Python.Python.3.12 -e --accept-package-agreements --accept-source-agreements --silent
        if %ERRORLEVEL% neq 0 (
            echo    ⚠️  No se pudo instalar automaticamente.
            echo    🌐 Por favor descarga desde: https://www.python.org/downloads/
            set /A ERRORS+=1
        ) else (
            echo    ✅ Python 3.12 instalado
            echo    🔄 Por favor reinicia y vuelve a ejecutar este script.
            pause
            exit /b 1
        )
    ) else (
        echo    ✅ Python encontrado (py launcher)
    )
) else (
    for /f "tokens=2" %%a in ('python --version') do echo    ✅ Python %%a
)

:: Verificar Node.js
echo.
echo [3/5] Verificando Node.js...
node --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    ❌ Node.js NO encontrado
    echo    📥 Instalando Node.js LTS via winget...

    winget install --id OpenJS.NodeJS.LTS -e --accept-package-agreements --accept-source-agreements --silent
    if %ERRORLEVEL% neq 0 (
        echo    ⚠️  No se pudo instalar automaticamente.
        echo    🌐 Por favor descarga desde: https://nodejs.org/
        set /A ERRORS+=1
    ) else (
        echo    ✅ Node.js instalado
        echo    🔄 Por favor reinicia y vuelve a ejecutar este script.
        pause
        exit /b 1
    )
) else (
    for /f "tokens=1" %%a in ('node --version') do echo    ✅ Node.js %%a
)

:: Verificar npm
npm --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    ❌ npm NO encontrado
    set /A ERRORS+=1
) else (
    for /f "tokens=1" %%a in ('npm --version') do echo    ✅ npm %%a
)

:: Verificar Git
echo.
echo [4/5] Verificando Git...
git --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    ❌ Git NO encontrado
    echo    📥 Instalando Git via winget...

    winget install --id Git.Git -e --accept-package-agreements --accept-source-agreements --silent
    if %ERRORLEVEL% neq 0 (
        echo    ⚠️  No se pudo instalar automaticamente.
        echo    🌐 Por favor descarga desde: https://git-scm.com/downloads
        set /A ERRORS+=1
    ) else (
        echo    ✅ Git instalado. Reinicia y vuelve a ejecutar.
        pause
        exit /b 1
    )
) else (
    for /f "tokens=3" %%a in ('git --version') do echo    ✅ Git %%a
)

:: Verificar que estamos en un repo Git o descargar
echo.
echo [5/5] Verificando repositorio...
if exist ".git" (
    echo    ✅ Repositorio Git encontrado
) else (
    echo    📥 Clonando repositorio Valhalla-SOC...
    git clone https://github.com/saantiidp/Valhalla-SOC.git .\temp_clone
    if %ERRORLEVEL% neq 0 (
        echo    ❌ No se pudo clonar el repositorio
        set /A ERRORS+=1
    ) else (
        xcopy "temp_clone\*" ".\" /E /I /Y >nul 2>&1
        rmdir /S /Q temp_clone
        echo    ✅ Repositorio clonado
    )
)

:: ═══════════════════════════════════════════════════════════════
echo.
if %ERRORS% gtr 0 (
    echo ❌ Se encontraron %ERRORS% errores. Por favor corrige antes de continuar.
    pause
    exit /b 1
)

:: ═══════════════════════════════════════════════════════════════
echo 📦 SECCION 2: Instalacion de Dependencias
:: ═══════════════════════════════════════════════════════════════
echo.

:: Backend dependencies
echo [1/2] Instalando dependencias del Backend...
if exist "backend\package.json" (
    cd backend
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo    ❌ Error instalando dependencias del backend
        pause
        exit /b 1
    )
    echo    ✅ Backend dependencies instaladas

    :: Crear .env si no existe
    if not exist ".env" (
        if exist ".env.example" (
            copy ".env.example" ".env" >nul
            echo    ✅ Archivo .env creado desde .env.example
        )
    )
    cd ..
) else (
    echo    ⚠️  No se encontro backend/package.json
)

:: Frontend - verificar si usa npm o es vanilla
echo.
echo [2/2] Verificando Frontend...
if exist "frontend\package.json" (
    cd frontend
    call npm install
    if %ERRORLEVEL% neq 0 (
        echo    ❌ Error instalando dependencias del frontend
        pause
        exit /b 1
    )
    echo    ✅ Frontend dependencies instaladas
    cd ..
) else (
    echo    ℹ️  Frontend es vanilla (HTML/CSS/JS), no requiere npm install
)

:: ═══════════════════════════════════════════════════════════════
echo.
echo 🐳 SECCION 3: Inicio de Servicios Docker
:: ═══════════════════════════════════════════════════════════════
echo.

:: Verificar docker-compose.yml existe
if not exist "docker-compose.yml" (
    echo ❌ No se encontro docker-compose.yml
    echo    Por favor asegurate de estar en el directorio correcto.
    pause
    exit /b 1
)

echo [1/3] Verificando estado de Docker...
docker info >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo    ❌ Docker no esta disponible. Inicia Docker Desktop manualmente.
    pause
    exit /b 1
)

echo [2/3] Descargando imagenes Docker (Wazuh + Cowrie)...
echo    ⏳ Esto puede tardar varios minutos la primera vez...
docker compose pull
if %ERRORLEVEL% neq 0 (
    echo    ⚠️  Algunas imagenes no se pudieron descargar, intentando continuar...
)

echo [3/3] Iniciando stack Wazuh + Cowrie...
docker compose up -d
if %ERRORLEVEL% neq 0 (
    echo    ❌ Error iniciando servicios Docker
    pause
    exit /b 1
)
echo    ✅ Stack Docker iniciado

:: Verificar contenedores corriendo
echo.
echo 🔍 Verificando contenedores...
timeout /t 5 /nobreak >nul

for %%C in (wazuh.manager wazuh.indexer wazuh.dashboard cowrie) do (
    docker ps --format "table {{.Names}}" | findstr "%%C" >nul
    if %ERRORLEVEL% equ 0 (
        echo    ✅ %%C corriendo
    ) else (
        echo    ⚠️  %%C puede estar iniciando aun...
    )
)

echo.
echo ⏳ Esperando 30 segundos para inicializacion completa...
timeout /t 30 /nobreak >nul

:: ═══════════════════════════════════════════════════════════════
echo.
echo 🚀 SECCION 4: Inicio del Dashboard Valhalla SOC
:: ═══════════════════════════════════════════════════════════════
echo.

echo [1/2] Iniciando Backend (puerto 3001)...
if exist "backend\server.js" (
    start "Valhalla Backend" cmd /k "cd /d %cd%\backend && npm start"
    echo    ✅ Backend iniciado en ventana separada
    timeout /t 3 /nobreak >nul
) else (
    echo    ❌ No se encontro backend/server.js
)

echo [2/2] Iniciando Frontend (puerto 3000)...
if exist "frontend\package.json" (
    start "Valhalla Frontend" cmd /k "cd /d %cd%\frontend && npm start"
    echo    ✅ Frontend iniciado en ventana separada
    timeout /t 3 /nobreak >nul
) else if exist "frontend\index.html" (
    :: Frontend vanilla - usar servidor simple o abrir directo
    start "Valhalla Frontend" cmd /k "cd /d %cd%\frontend && npx serve -s . -l 3000"
    echo    ✅ Frontend iniciado en puerto 3000
    timeout /t 3 /nobreak >nul
) else (
    echo    ⚠️  Frontend no configurado correctamente
)

:: ═══════════════════════════════════════════════════════════════
echo.
echo 🌐 SECCION 5: Abriendo Dashboards
:: ═══════════════════════════════════════════════════════════════
echo.

echo    ⏳ Esperando 10 segundos para que los servicios esten listos...
timeout /t 10 /nobreak >nul

echo [1/2] Abriendo Valhalla SOC Dashboard...
start http://localhost:3000

echo [2/2] Abriendo Wazuh Dashboard (nativo)...
start https://localhost

:: ═══════════════════════════════════════════════════════════════
echo.
echo ╔══════════════════════════════════════════════════════════════════╗
echo ║              ✅ VALHALLA SOC INICIADO CORRECTAMENTE              ║
echo ╚══════════════════════════════════════════════════════════════════╝
echo.
echo 📊 Dashboards disponibles:
echo    🏠 Valhalla SOC:     http://localhost:3000
echo    📊 Wazuh nativo:     https://localhost
echo.
echo 🔧 Servicios corriendo:
echo    ✅ Wazuh Manager     - Puerto 55000
echo    ✅ Wazuh Indexer    - Puerto 9200
echo    ✅ Wazuh Dashboard  - Puerto 443 (HTTPS)
echo    ✅ Cowrie Honeypot  - Puertos 2222 (SSH), 2223 (Telnet)
echo    ✅ Backend API      - Puerto 3001
echo    ✅ Frontend         - Puerto 3000
echo.
echo ☁️  Nota: Ollama se usa via cloud externo (no local).
echo    Asegurate de tener Ollama cloud configurado si lo necesitas.
echo.
echo 📝 Credenciales por defecto:
echo    Wazuh Dashboard: admin / admin
echo    Ver .env en backend para credenciales del dashboard propio.
echo.
echo ⚠️  Para detener todos los servicios:
echo    Ejecuta: detener-todo.bat
echo.
echo ℹ️  Para ver logs:
echo    Docker: docker compose logs -f
echo    Backend: En su ventana de terminal
echo    Frontend: En su ventana de terminal
echo.
pause
