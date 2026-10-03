# Publica S.Y.N.A.P.S.E. en https://github.com/maricelmeneses/synapse (rama main) CON su historial.
#
# Qué hace:
#   1. Clona la rama de trabajo del repositorio de Yoandy (público, no pide credenciales).
#   2. Extrae solo la carpeta synapse/ con todos sus commits (git subtree split).
#   3. La sube a la rama main del repositorio de Maricel. Aquí Git abre el navegador para iniciar sesión
#      (Git Credential Manager, incluido en Git for Windows).
#
# Se puede ejecutar tantas veces como haga falta: cada vez sube solo lo nuevo.
# Trabaja en una carpeta temporal que se borra al terminar.
#
# Uso en Windows (PowerShell):
#   irm https://raw.githubusercontent.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy/claude/sweet-brahmagupta-rzk7c1/synapse/scripts/publicar_en_github.ps1 | iex
# Forzar (si main tiene un README creado en la web que no se necesita):
#   $env:SYNAPSE_FORZAR = "1"; irm <misma URL> | iex

$ErrorActionPreference = 'Stop'
$Origen  = if ($env:SYNAPSE_ORIGEN)  { $env:SYNAPSE_ORIGEN }  else { 'https://github.com/heindall92/Proyecto-Master-Ciberseguridad-Evolve-Yoandy.git' }
$Rama    = if ($env:SYNAPSE_RAMA)    { $env:SYNAPSE_RAMA }    else { 'claude/sweet-brahmagupta-rzk7c1' }
$Destino = if ($env:SYNAPSE_DESTINO) { $env:SYNAPSE_DESTINO } else { 'https://github.com/maricelmeneses/synapse.git' }

function Paso($m)  { Write-Host "`n> $m" -ForegroundColor Cyan }
function Ok($m)    { Write-Host "OK  $m" -ForegroundColor Green }
function Fallo($m) { Write-Host "`nERROR  $m" -ForegroundColor Red; exit 1 }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Fallo 'Git no está instalado. Descárgalo de https://git-scm.com/download/win y vuelve a ejecutar.' }

$Tmp = Join-Path ([IO.Path]::GetTempPath()) ("synapse-" + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Tmp | Out-Null
try {
  Paso "Descargando la rama de trabajo ($Rama)..."
  git clone --quiet --branch $Rama --single-branch $Origen "$Tmp\origen"
  if ($LASTEXITCODE -ne 0) { Fallo "No se pudo clonar $Origen" }
  Set-Location "$Tmp\origen"
  if (-not (Test-Path synapse)) { Fallo "La rama $Rama no contiene la carpeta synapse/" }

  Paso 'Extrayendo synapse/ con su historial...'
  git subtree split --prefix=synapse -b synapse-main | Out-Null
  if ($LASTEXITCODE -ne 0) { Fallo "Tu Git no incluye 'git subtree'. Instala Git for Windows actualizado." }
  Ok "$(git rev-list --count synapse-main) commits listos"

  $flags = @()
  if ($env:SYNAPSE_FORZAR -eq '1') { $flags = @('--force'); Paso 'Modo forzado: el main remoto se sustituye por el historial del proyecto.' }

  Paso "Subiendo a $Destino (main). Si se abre el navegador, inicia sesión con la cuenta maricelmeneses."
  git push @flags $Destino synapse-main:main
  if ($LASTEXITCODE -ne 0) {
    Write-Host @'

GitHub rechazó la subida. Las causas habituales:
  * "Authentication failed": inicia sesión en la ventana del navegador que abre Git, o crea un token en
    https://github.com/settings/tokens (permiso "repo") y úsalo como contraseña.
  * "rejected (fetch first)": main tiene commits creados en la web (por ejemplo, un README).
    Si no los necesitas, repite con:  $env:SYNAPSE_FORZAR = "1"  antes del comando.
'@ -ForegroundColor Yellow
    exit 1
  }
  Ok "Publicado: $($Destino -replace '\.git$','')"
}
finally {
  Set-Location $HOME
  Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
}
