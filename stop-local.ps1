$ErrorActionPreference = 'Stop'
$dauysManifest = Join-Path $PSScriptRoot 'data/local-processes.json'
if (-not (Test-Path -LiteralPath $dauysManifest)) { Write-Output 'No Dauys app processes recorded.'; exit }
foreach ($dauysItem in @(Get-Content -LiteralPath $dauysManifest -Raw | ConvertFrom-Json)) {
  $dauysProcess = Get-Process -Id $dauysItem.id -ErrorAction SilentlyContinue
  $dauysStarted = ([datetime]$dauysItem.started).ToUniversalTime().Ticks
  if ($dauysProcess) {
    if ($dauysProcess.Path -ne $dauysItem.path -or $dauysProcess.StartTime.ToUniversalTime().Ticks -ne $dauysStarted) { throw 'Recorded process identity does not match. No unrelated process was stopped.' }
    Stop-Process -Id $dauysProcess.Id
    [void]$dauysProcess.WaitForExit(3000)
  }
}
Write-Output 'Recorded Dauys app processes stopped. Shared PostgreSQL was left running.'
