[CmdletBinding()]
param([string]$Destination)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if(-not $Destination){$Destination=Join-Path $PWD ('data/backups/compose-'+(Get-Date -Format 'yyyyMMdd_HHmmss'))}
$Destination=[IO.Path]::GetFullPath($Destination)
if(Test-Path -LiteralPath $Destination){throw 'Choose a new backup directory; nothing will be overwritten.'}
New-Item -ItemType Directory -Path $Destination|Out-Null
function Invoke-DauysDocker([string[]]$Arguments){& docker @Arguments;if($LASTEXITCODE -ne 0){throw 'Docker backup command failed'}}
$dauysRestart=$false
try {
 # Stop the sole application writer while taking the paired DB + file snapshot.
 Invoke-DauysDocker @('compose','stop','api');$dauysRestart=$true
 Invoke-DauysDocker @('compose','exec','-T','db','pg_dump','-U','dauys','-d','dauys','-Fc','-f','/tmp/dauys-backup.dump')
 Invoke-DauysDocker @('compose','cp','db:/tmp/dauys-backup.dump',(Join-Path $Destination 'database.dump'))
 # A one-off service container mounts the same named uploads volume.
 Invoke-DauysDocker @('compose','run','--rm','--no-deps','--user','0:0','--volume',($Destination+':/backup'),'--entrypoint','tar','api','-C','/data','-czf','/backup/uploads.tar.gz','uploads')
 $dauysHashes=Get-ChildItem -LiteralPath $Destination -File|Get-FileHash -Algorithm SHA256|Select-Object @{Name='File';Expression={Split-Path $_.Path -Leaf}},Hash
 $dauysHashes|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Destination 'sha256.json')
 Write-Output "Backup: $Destination"
} finally {if($dauysRestart){& docker compose start api}}
