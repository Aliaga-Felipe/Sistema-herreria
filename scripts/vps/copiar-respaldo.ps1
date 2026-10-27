# Baja a la PC (OneDrive) el último respaldo del VPS: la base y las fotos.
#
# Se corre desde PowerShell en la PC, una vez por semana:
#
#   powershell -ExecutionPolicy Bypass -File scripts\vps\copiar-respaldo.ps1
#
# Necesita el alias "herreria" en ~/.ssh/config (ver DESPLIEGUE.md). Guarda
# cada copia en una carpeta con la fecha y conserva las 4 más recientes, sin
# pasar nunca de 1 GB en total (si se pasa, borra las más viejas).
param(
  [string]$Servidor = "herreria",
  [string]$Destino = (Join-Path $env:OneDrive "Respaldos herreria"),
  [int]$Copias = 4,
  [long]$LimiteBytes = 1GB
)
$ErrorActionPreference = "Stop"

$remoto = '~/backups/diarios'
$db = (ssh $Servidor "ls -1t $remoto/db-*.sql.gz | head -n 1").Trim()
$fotos = (ssh $Servidor "ls -1t $remoto/uploads-*.tar.gz | head -n 1").Trim()
if (-not $db -or -not $fotos) { throw "No se encontraron respaldos en el VPS ($remoto)." }

$carpeta = Join-Path $Destino (Get-Date -Format "yyyy-MM-dd")
New-Item -ItemType Directory -Force -Path $carpeta | Out-Null
scp "${Servidor}:$db" "${Servidor}:$fotos" $carpeta
if ($LASTEXITCODE -ne 0) { throw "Falló la copia desde el VPS." }

function Copias-Guardadas { Get-ChildItem $Destino -Directory | Sort-Object Name -Descending }
function Tamano($carpetas) { ($carpetas | Get-ChildItem -Recurse -File | Measure-Object Length -Sum).Sum }

$guardadas = @(Copias-Guardadas)
$guardadas | Select-Object -Skip $Copias | Remove-Item -Recurse -Force
$guardadas = @(Copias-Guardadas)
while ($guardadas.Count -gt 1 -and (Tamano $guardadas) -gt $LimiteBytes) {
  $guardadas[-1] | Remove-Item -Recurse -Force
  $guardadas = @(Copias-Guardadas)
}

"Copia lista en $carpeta. Total guardado: {0:N0} MB en {1} copias." -f ((Tamano $guardadas) / 1MB), $guardadas.Count
