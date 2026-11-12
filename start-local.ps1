[CmdletBinding()]
param([string]$DatabaseUrl, [string]$RuntimePath, [bool]$DemoMode = $true, [switch]$Lan)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$dauysData = Join-Path $PSScriptRoot 'data'
New-Item -ItemType Directory -Path $dauysData -Force | Out-Null
$dauysConfigPath = Join-Path $dauysData 'local-config.json'
$dauysConfig = if (Test-Path -LiteralPath $dauysConfigPath) { Get-Content -LiteralPath $dauysConfigPath -Raw | ConvertFrom-Json } else { $null }
if (-not $RuntimePath) { $RuntimePath = if ($env:DAUYS_RUNTIME_DIR) { $env:DAUYS_RUNTIME_DIR } else { $dauysConfig.runtimePath } }
if (-not $DatabaseUrl) { $DatabaseUrl = if ($env:DATABASE_URL) { $env:DATABASE_URL } elseif ($dauysConfig.databaseUrl) { $dauysConfig.databaseUrl } else { 'postgres://dauys@127.0.0.1:55432/dauys?sslmode=disable' } }
$dauysPorts = @(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -in 8080,5175)
if ($dauysPorts.Count) { throw 'Port 8080 or 5175 is already in use. Stop the existing instance first; no other process was stopped.' }
$dauysGo = (Get-Command go -ErrorAction SilentlyContinue).Source
if (-not $dauysGo -and $RuntimePath) { $dauysGo = Join-Path $RuntimePath 'tools/go/bin/go.exe' }
if (-not $dauysGo -or -not (Test-Path -LiteralPath $dauysGo)) { throw 'Go 1.24+ is required. Install Go or pass -RuntimePath with the prepared tools directory.' }
if ($RuntimePath) { $env:GOPATH = Join-Path $RuntimePath 'gopath'; $env:GOCACHE = Join-Path $RuntimePath 'gocache' }
$dauysPgBin = 'C:/Program Files/PostgreSQL/17/bin'
if ($DatabaseUrl -match '@127\.0\.0\.1:55432/' -and $RuntimePath -and (Test-Path -LiteralPath (Join-Path $dauysPgBin 'pg_isready.exe'))) {
  & (Join-Path $dauysPgBin 'pg_isready.exe') -h 127.0.0.1 -p 55432 *> $null
  if ($LASTEXITCODE -ne 0) {
    $dauysPgData = Join-Path $RuntimePath 'pgdata'
    if (-not (Test-Path -LiteralPath (Join-Path $dauysPgData 'PG_VERSION'))) { throw 'Prepared PostgreSQL cluster not found. Configure DATABASE_URL for your server.' }
    Start-Process -FilePath (Join-Path $dauysPgBin 'postgres.exe') -ArgumentList @('-D', ('"' + $dauysPgData + '"'), '-h', '127.0.0.1', '-p', '55432', '-c', 'max_connections=40', '-c', 'shared_buffers=64MB') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $dauysData 'postgres-out.log') -RedirectStandardError (Join-Path $dauysData 'postgres-error.log') | Out-Null
    $dauysPgReady = $false
    for ($dauysAttempt = 0; $dauysAttempt -lt 40; $dauysAttempt++) { & (Join-Path $dauysPgBin 'pg_isready.exe') -h 127.0.0.1 -p 55432 *> $null; if ($LASTEXITCODE -eq 0) { $dauysPgReady = $true; break }; Start-Sleep -Milliseconds 250 }
    if (-not $dauysPgReady) { throw 'PostgreSQL did not start. See data/postgres-error.log.' }
  }
}
New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'backend/bin') -Force | Out-Null
& $dauysGo -C (Join-Path $PSScriptRoot 'backend') build -trimpath -o bin/dauys.exe ./cmd/server
if ($LASTEXITCODE -ne 0) { throw 'Go build failed.' }
if (-not (Test-Path -LiteralPath 'node_modules')) { npm.cmd ci --no-fund --no-audit; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' } }
$env:DATABASE_URL = $DatabaseUrl
$env:DEMO_MODE = $DemoMode.ToString().ToLowerInvariant()
$env:COOKIE_SECURE = 'false'
$env:HOST = '127.0.0.1'
$env:PORT = '8080'
$env:UPLOAD_DIR = Join-Path $dauysData 'uploads'
$env:APP_ORIGINS = 'http://127.0.0.1:5175,http://localhost:5175'
$dauysWebHost = '127.0.0.1'
if ($Lan) {
  $dauysWebHost = '0.0.0.0'
  $dauysLanIPs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)' }
  foreach ($dauysIP in $dauysLanIPs) { $env:APP_ORIGINS += ',http://' + $dauysIP.IPAddress + ':5175' }
}
$dauysProcesses = @()
try {
  $dauysApi = Start-Process -FilePath (Join-Path $PSScriptRoot 'backend/bin/dauys.exe') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dauysData 'api-out.log') -RedirectStandardError (Join-Path $dauysData 'api-error.log')
  $dauysProcesses += @{id=$dauysApi.Id; path=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'backend/bin/dauys.exe')); started=$dauysApi.StartTime.ToUniversalTime().ToString('O')}
  $dauysReady = $false
  for ($dauysAttempt = 0; $dauysAttempt -lt 40; $dauysAttempt++) {
    if ($dauysApi.HasExited) { throw 'API stopped. See data/api-error.log.' }
    try { $dauysHealth = Invoke-RestMethod 'http://127.0.0.1:8080/api/health' -TimeoutSec 2; if ($dauysHealth.ok) { $dauysReady = $true; break } } catch { }
    Start-Sleep -Milliseconds 250
  }
  if (-not $dauysReady) { throw 'API did not become ready.' }
  $dauysWeb = Start-Process -FilePath (Get-Command node).Source -ArgumentList @('node_modules/vite/bin/vite.js','--host',$dauysWebHost,'--port','5175','--strictPort') -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dauysData 'web-out.log') -RedirectStandardError (Join-Path $dauysData 'web-error.log')
  $dauysProcesses += @{id=$dauysWeb.Id; path=(Get-Command node).Source; started=$dauysWeb.StartTime.ToUniversalTime().ToString('O')}
} finally { $dauysProcesses | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dauysData 'local-processes.json') }
Write-Output 'Dauys: http://127.0.0.1:5175. Logs: data/. Stop: ./stop-local.ps1'
