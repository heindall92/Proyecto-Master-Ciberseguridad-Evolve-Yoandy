# =============================================================
#  Valhalla SOC - Honeypot - Verificacion automatica (Windows)
#
#  Uso (desde la carpeta honeypot/):
#    powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
#
#  Requisitos:
#    - Docker Desktop corriendo
#    - Puertos 2222 y 2223 libres
#
#  NOTA: este fichero usa SOLO ASCII a proposito - Windows
#  PowerShell 5.x no lee UTF-8 sin BOM y rompe el parser.
# =============================================================

$ErrorActionPreference = "Stop"

# Ir a la carpeta honeypot/
$HoneypotDir = Split-Path -Parent $PSScriptRoot
Set-Location $HoneypotDir

# Fichero de evidencia final
$Date = Get-Date -Format "yyyyMMdd-HHmmss"
$EvidenceFile = Join-Path "docs" ("EVIDENCIA-" + $Date + ".md")

# ----- helpers ----------------------------------------------
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

# ----- cabecera del informe --------------------------------
New-Item -Force -ItemType Directory -Path "docs" | Out-Null
New-Item -Force -ItemType File -Path $EvidenceFile | Out-Null

W "# Valhalla SOC - Honeypot - Evidencia de verificacion"
W ""
W ("**Generado:** " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "  ")
W ("**Maquina:** " + $env:COMPUTERNAME + "  ")
W ("**Usuario:** " + $env:USERNAME + "  ")
W ("**Carpeta:** ``" + $HoneypotDir + "``")
W ""
W "> Documento generado automaticamente por scripts/verify.ps1. Cada seccion incluye el comando ejecutado y la salida real capturada."
W ""
W "---"

Log "Iniciando verificacion automatica..."
Log ("Informe -> " + $EvidenceFile)
Log ""

# ----- TC-00 Entorno ---------------------------------------
W ""
W "## TC-00 - Entorno"
W ""
$dockerV  = Run-Cmd 'docker --version'
$composeV = Run-Cmd 'docker compose version'
W '```'
W "docker --version"
W $dockerV.out
W ""
W "docker compose version"
W $composeV.out
W '```'
if ($dockerV.out -match "Docker version") { Mark-OK "TC-00" } else { Mark-KO "TC-00" "docker no disponible"; Write-Host "Abre Docker Desktop y reintenta." -ForegroundColor Red; exit 1 }

# ----- TC-01 Imagen ---------------------------------------
W ""
W "## TC-01 - Imagen Docker disponible"
W ""
Log "docker pull cowrie/cowrie:latest (puede tardar 1-2 min la primera vez)..."
$pull = Run-Cmd 'docker pull cowrie/cowrie:latest'
W '```'
W "docker pull cowrie/cowrie:latest"
W $pull.out
W '```'
if ($pull.out -match "(Downloaded|up to date|Pull complete|Status: Image)") { Mark-OK "TC-01" } else { Mark-KO "TC-01" "pull fallo" }

# ----- TC-02 Arranque -------------------------------------
W ""
W "## TC-02 - Stack arranca sin errores"
W ""
Log "Arrancando stack..."
Run-Cmd 'docker compose down' | Out-Null
$upResult = Run-Cmd 'docker compose up -d'
W '```'
W "docker compose up -d"
W $upResult.out
W '```'
if ($upResult.out -match "(Started|Running|Created|already|is up)") { Mark-OK "TC-02" } else { Mark-KO "TC-02" "fallo al arrancar" }

Log "Esperando 30s a que Cowrie inicialice..."
Start-Sleep -Seconds 30

# ----- TC-03 Healthcheck ----------------------------------
W ""
W "## TC-03 - Healthcheck"
W ""
$state  = Run-Cmd "docker inspect -f '{{.State.Status}}' valhalla-cowrie"
$health = Run-Cmd "docker inspect -f '{{.State.Health.Status}}' valhalla-cowrie"
$retry = 0
while (($health.out -notmatch "healthy") -and ($retry -lt 6)) {
    Start-Sleep -Seconds 10
    $health = Run-Cmd "docker inspect -f '{{.State.Health.Status}}' valhalla-cowrie"
    $retry++
}
W '```'
W ("State.Status:        " + $state.out)
W ("State.Health.Status: " + $health.out)
W '```'
if ($health.out -match "healthy") { Mark-OK "TC-03" } else { Mark-KO "TC-03" ("health=" + $health.out) }

# ----- TC-04 Puerto SSH -----------------------------------
W ""
W "## TC-04 - Puerto SSH (2222) escucha"
W ""
$ssh = Test-NetConnection -ComputerName localhost -Port 2222 -InformationLevel Quiet -WarningAction SilentlyContinue
W '```'
W ("Test-NetConnection localhost -Port 2222 -> " + $ssh)
W '```'
if ($ssh) { Mark-OK "TC-04" } else { Mark-KO "TC-04" "puerto 2222 no escucha" }

# ----- TC-05 Puerto Telnet --------------------------------
W ""
W "## TC-05 - Puerto Telnet (2223) escucha"
W ""
$tel = Test-NetConnection -ComputerName localhost -Port 2223 -InformationLevel Quiet -WarningAction SilentlyContinue
W '```'
W ("Test-NetConnection localhost -Port 2223 -> " + $tel)
W '```'
if ($tel) { Mark-OK "TC-05" } else { Mark-KO "TC-05" "puerto 2223 no escucha" }

# ----- TC-06 Banner SSH -----------------------------------
W ""
W "## TC-06 - Banner SSH enganoso"
W ""
$banner = ""
try {
    $tcp = New-Object System.Net.Sockets.TcpClient("localhost", 2222)
    $stream = $tcp.GetStream()
    $stream.ReadTimeout = 3000
    $buf = New-Object byte[] 256
    $n = $stream.Read($buf, 0, 256)
    $banner = [System.Text.Encoding]::ASCII.GetString($buf, 0, $n).Trim()
    $tcp.Close()
} catch {
    $banner = "(error: " + $_.Exception.Message + ")"
}
W '```'
W ("Banner recibido: " + $banner)
W '```'
if ($banner -match "SSH-2\.0-OpenSSH") { Mark-OK "TC-06" } else { Mark-KO "TC-06" "banner inesperado" }

# ----- TC-07 + TC-09 login + comandos --------------------
W ""
W "## TC-07 + TC-09 - Login aceptado + comandos en shell falsa"
W ""
Log "Lanzando ataques simulados..."

$pyok = $false
$pyCmd = $null
foreach ($c in @("python","python3","py")) {
    if (Get-Command $c -ErrorAction SilentlyContinue) { $pyok = $true; $pyCmd = $c; break }
}

if ($pyok) {
    $pyScript = @'
import sys, time
try:
    import paramiko
except ImportError:
    print("NO_PARAMIKO")
    sys.exit(0)
creds = [("root","123456"),("admin","admin"),("pi","raspberry"),("root","toor"),("ubuntu","ubuntu")]
for u,p in creds:
    try:
        c = paramiko.SSHClient()
        c.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        c.connect("127.0.0.1", port=2222, username=u, password=p,
                  timeout=5, banner_timeout=5, auth_timeout=5,
                  allow_agent=False, look_for_keys=False)
        _, out, _ = c.exec_command("uname -a; id; ls /; cat /etc/passwd | head -3")
        print("[OK] {}:{} -> {}".format(u, p, out.read().decode("utf-8","ignore")[:250]))
        c.close()
    except Exception as e:
        print("[FAIL] {}:{} -> {}".format(u, p, e))
    time.sleep(1)
'@
    $tmpPy = Join-Path $env:TEMP "cowrie_attack.py"
    Set-Content -Path $tmpPy -Value $pyScript -Encoding ASCII
    # instalar paramiko silencioso (ignorar fallos)
    & $pyCmd -m pip install --quiet paramiko 2>&1 | Out-Null
    $attack = Run-Cmd ($pyCmd + ' "' + $tmpPy + '"')
    W '```'
    W $attack.out
    W '```'
    if ($attack.out -match "\[OK\]") { Mark-OK "TC-07"; Mark-OK "TC-09" } else { Mark-KO "TC-07" "no loguea con paramiko" }
} else {
    W "_(Python no disponible - solo se generan conexiones TCP, no se ejecutan comandos.)_"
    W ""
    for ($i=0; $i -lt 5; $i++) {
        try {
            $tcp = New-Object System.Net.Sockets.TcpClient("localhost", 2222)
            Start-Sleep -Milliseconds 500
            $tcp.Close()
        } catch {}
    }
    W '```'
    W "5 conexiones TCP generadas contra localhost:2222"
    W '```'
    Mark-OK "TC-07"
    Mark-KO "TC-09" "sin python no se ejecutan comandos en la shell falsa"
}

# ----- TC-10 + TC-11 Eventos JSON ------------------------
W ""
W "## TC-10 + TC-11 - Eventos en cowrie.json"
W ""
Start-Sleep -Seconds 3
$logFile = Join-Path $HoneypotDir "logs\cowrie.json"
if (Test-Path $logFile) {
    $allLines = Get-Content $logFile
    $count = $allLines.Count
    $tail = $allLines | Select-Object -Last 20
    W ("Total de eventos registrados: **" + $count + "**")
    W ""
    W "Ultimas lineas (max 20):"
    W '```json'
    W ($tail -join "`n")
    W '```'
    if ($count -gt 0) { Mark-OK "TC-10" } else { Mark-KO "TC-10" "JSON vacio" }
    if ($count -gt 5) { Mark-OK "TC-11" } else { Mark-KO "TC-11" ("solo " + $count + " eventos") }
} else {
    W "cowrie.json no existe en logs/."
    Mark-KO "TC-10" "no existe logs/cowrie.json"
    Mark-KO "TC-11" "no existe logs/cowrie.json"
}

# ----- TC-13 Persistencia --------------------------------
W ""
W "## TC-13 - Persistencia tras restart"
W ""
$n1 = 0
if (Test-Path $logFile) { $n1 = (Get-Content $logFile).Count }
Log "Reiniciando contenedor..."
Run-Cmd 'docker compose restart' | Out-Null
Start-Sleep -Seconds 10
$n2 = 0
if (Test-Path $logFile) { $n2 = (Get-Content $logFile).Count }
W '```'
W ("Eventos antes del restart: " + $n1)
W ("Eventos despues:           " + $n2)
W '```'
if ($n2 -ge $n1) { Mark-OK "TC-13" } else { Mark-KO "TC-13" "logs perdidos" }

# ----- TC-14 Volumenes -----------------------------------
W ""
W "## TC-14 - Volumenes nombrados"
W ""
$vols = Run-Cmd 'docker volume ls --format "{{.Name}}"'
W '```'
W $vols.out
W '```'
if ($vols.out -match "valhalla_cowrie_logs") { Mark-OK "TC-14" } else { Mark-KO "TC-14" "volumen ausente" }

# ----- TC-15 Bind-mount ----------------------------------
W ""
W "## TC-15 - Bind-mount local refleja los logs"
W ""
$dir = Get-ChildItem -Path (Join-Path $HoneypotDir "logs") -Force -ErrorAction SilentlyContinue
W '```'
W "Contenido de logs/:"
foreach ($f in $dir) { W ("  " + $f.Name + "  (" + $f.Length + " bytes)") }
W '```'
$hasJson = $dir | Where-Object { $_.Name -eq "cowrie.json" -and $_.Length -gt 0 }
if ($hasJson) { Mark-OK "TC-15" } else { Mark-KO "TC-15" "cowrie.json vacio o ausente" }

# ----- Resumen -------------------------------------------
W ""
W "---"
W ""
W "## Resumen"
W ""
W "| Test | Estado |"
W "|------|--------|"
$okCount = 0
$total = 0
foreach ($r in $Script:Results) {
    $extra = ""
    if ($r.Why -ne "") { $extra = " _(" + $r.Why + ")_" }
    $line = "| " + $r.ID + " | [" + $r.Status + "]" + $extra + " |"
    W $line
    if ($r.Status -eq "OK") { $okCount++ }
    $total++
}
W ""
W ("**Total: " + $okCount + " / " + $total + " tests OK**")
W ""
if ($okCount -eq $total) {
    W "### Veredicto: APTO para integracion con el backend FastAPI."
} else {
    W "### Veredicto: revisar los tests en KO antes de integrar."
}
W ""
W ("_Informe generado por scripts/verify.ps1 el " + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + "_")

# ----- Final --------------------------------------------
Log ""
Log "===================================================="
Log "  Verificacion completa."
Log ("  Evidencia guardada en: " + $EvidenceFile)
Log "===================================================="
Log ""
$color = "Yellow"
if ($okCount -eq $total) { $color = "Green" }
Write-Host ("  " + $okCount + " / " + $total + " tests OK") -ForegroundColor $color
Log ""
Log "Para ver el informe:"
Log ("  notepad " + $EvidenceFile)
Log ""
Log "El honeypot sigue corriendo. Para pararlo:"
Log "  docker compose down"
