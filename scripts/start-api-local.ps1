[CmdletBinding()]
param([switch]$Lan)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
if(Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue){throw 'Port 8080 is occupied; no process was stopped.'}
$dauysConfig=Get-Content data/local-config.json -Raw|ConvertFrom-Json
$env:DATABASE_URL=$dauysConfig.databaseUrl
$env:DEMO_MODE='false';$env:HOST='127.0.0.1';$env:PORT='8080';$env:COOKIE_SECURE='false'
$env:APP_ORIGINS='http://127.0.0.1:5175,http://localhost:5175,http://127.0.0.1:8080,http://localhost:8080'
$env:UPLOAD_DIR=Join-Path $PWD 'data/uploads';$env:DIST_DIR=Join-Path $PWD 'dist'
$env:APP_PUBLIC_URL=''
if($Lan){
 $env:HOST='0.0.0.0'
 $dauysIPs=@(Get-NetIPAddress -AddressFamily IPv4|Where-Object {$_.IPAddress -match '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' -and $_.InterfaceAlias -notmatch 'vEthernet|WSL|Docker'})
 foreach($dauysIP in $dauysIPs){$env:APP_ORIGINS+=',http://'+$dauysIP.IPAddress+':8080'}
 if($dauysIPs.Count){$env:APP_PUBLIC_URL='http://'+$dauysIPs[0].IPAddress+':8080'}
}
$dauysExe=Join-Path $PWD 'backend/bin/dauys.exe'
$dauysApi=Start-Process -FilePath $dauysExe -WorkingDirectory $PWD -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $PWD 'data/api-out.log') -RedirectStandardError (Join-Path $PWD 'data/api-error.log')
$dauysProcesses=@(Get-Content data/local-processes.json -Raw|ConvertFrom-Json|Where-Object {$_.path -ne $dauysExe})
$dauysProcesses+=@{id=$dauysApi.Id;path=$dauysExe;started=$dauysApi.StartTime.ToUniversalTime().ToString('O')}
$dauysProcesses|ConvertTo-Json|Set-Content data/local-processes.json
$dauysReady=$false
for($dauysAttempt=0;$dauysAttempt -lt 30;$dauysAttempt++){
 if($dauysApi.HasExited){throw 'API stopped. See data/api-error.log.'}
 try{if((Invoke-RestMethod 'http://127.0.0.1:8080/api/health' -TimeoutSec 2).ok){$dauysReady=$true;break}}catch{}
 Start-Sleep -Milliseconds 250
}
if(-not $dauysReady){throw 'API did not become ready. See data/api-error.log.'}
'API ready: http://127.0.0.1:8080. Existing Vite on 5175 was not restarted.'
