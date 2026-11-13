[CmdletBinding()]
param([switch]$SkipBrowser,[switch]$SkipBuild,[switch]$KeepDatabase)
$ErrorActionPreference='Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$dauysRoot=$PWD.Path
$dauysStamp=Get-Date -Format 'yyyyMMdd_HHmmss'
$dauysOutput=Join-Path $dauysRoot ('data/verification/'+$dauysStamp)
New-Item -ItemType Directory -Path $dauysOutput -Force|Out-Null
$dauysReport=@{started=(Get-Date -Format o);status='RUNNING';steps=@();apiChecks=0;browserChecked=$false;reportDirectory=$dauysOutput}
$dauysApi=$null;$dauysApiTicks=0;$dauysCreatedDatabase=$false;$dauysSucceeded=$false
$dauysCfg=Get-Content data/local-config.json -Raw|ConvertFrom-Json
if($dauysCfg.databaseUrl -ne 'postgres://dauys@127.0.0.1:55432/dauys?sslmode=disable'){throw 'This verification script supports only the prepared local PostgreSQL. It refuses other databases.'}
$dauysPg='C:/Program Files/PostgreSQL/17/bin'
$dauysGo=Join-Path $dauysCfg.runtimePath 'tools/go/bin/go.exe'
$dauysDb='dauys_workflow_release_'+$dauysStamp
$dauysExe=Join-Path $dauysRoot 'backend/bin/dauys-verify.exe'
$dauysSession='dauys-preflight-'+$dauysStamp
$dauysKeys=@('GOPATH','GOCACHE','DAUYS_MIGRATION_TEST_URL','DATABASE_URL','DEMO_MODE','HOST','PORT','COOKIE_SECURE','APP_ORIGINS','UPLOAD_DIR','DIST_DIR','APP_PUBLIC_URL','BASE_URL','DAUYS_ALLOW_TEST_WRITES')
$dauysPrevious=@{};foreach($dauysKey in $dauysKeys){$dauysPrevious[$dauysKey]=[Environment]::GetEnvironmentVariable($dauysKey,'Process')}
function Write-UTF8([string]$Path,[string]$Content){[IO.File]::WriteAllText($Path,$Content,[Text.UTF8Encoding]::new($false))}
function Invoke-Verified([string]$Name,[string]$File,[string[]]$Arguments,[switch]$Browser) {
 Write-Host "CHECK $Name"
 $dauysLines=& $File @Arguments 2>&1
 $dauysCode=$LASTEXITCODE
 $dauysText=$dauysLines|Out-String
 $dauysText|Set-Content -LiteralPath (Join-Path $dauysOutput ($Name+'.log'))
 if($dauysCode -ne 0 -or ($Browser -and $dauysText -match '(?m)^### Error')){
  $dauysLines|Select-Object -Last 20|ForEach-Object {Write-Host $_}
  throw "$Name failed. See $dauysOutput"
 }
 $dauysReport.steps+=@{name=$Name;status='PASS'}
 if($Name -like 'api-*'){$dauysMatches=[regex]::Matches($dauysText,'"checks"\s*:\s*(\d+)');if($dauysMatches.Count){$dauysReport.apiChecks+=[int]$dauysMatches[$dauysMatches.Count-1].Groups[1].Value}}
 if($Name -eq 'browser-flow' -and $dauysText -notmatch '"status"\s*:\s*"PASS"'){throw 'Browser did not return a success result.'}
 Write-Host "PASS $Name"
}
function Get-MainSnapshot {
 $dauysSql="SELECT json_build_object('appeals',(SELECT md5(string_agg(row_to_json(a)::text,E'\n' ORDER BY id)) FROM appeals a),'history',(SELECT md5(string_agg(row_to_json(h)::text,E'\n' ORDER BY id)) FROM history h))::text;"
 $dauysState=& (Join-Path $dauysPg 'psql.exe') -h 127.0.0.1 -p 55432 -U dauys -d dauys -At -c $dauysSql
 if($LASTEXITCODE -ne 0){throw 'Unable to fingerprint working data'}
 return $dauysState
}
try {
 $dauysBefore=Get-MainSnapshot
 $env:GOPATH=Join-Path $dauysCfg.runtimePath 'gopath';$env:GOCACHE=Join-Path $dauysCfg.runtimePath 'gocache'
 Invoke-Verified 'typescript' 'npm.cmd' @('run','check')
 Invoke-Verified 'unit' 'npm.cmd' @('test')
 if(-not $SkipBuild){Invoke-Verified 'frontend-build' 'npm.cmd' @('run','build')}
 Invoke-Verified 'database-backup' (Join-Path $dauysPg 'pg_dump.exe') @('-h','127.0.0.1','-p','55432','-U','dauys','-d','dauys','-Fc','-f',(Join-Path $dauysOutput 'database.dump'))
 Invoke-Verified 'database-create' (Join-Path $dauysPg 'createdb.exe') @('-h','127.0.0.1','-p','55432','-U','dauys',$dauysDb)
 $dauysCreatedDatabase=$true
 Invoke-Verified 'database-restore' (Join-Path $dauysPg 'pg_restore.exe') @('-h','127.0.0.1','-p','55432','-U','dauys','-d',$dauysDb,'--no-owner',(Join-Path $dauysOutput 'database.dump'))
 @{database=$dauysDb;backup=(Join-Path $dauysOutput 'database.dump')}|ConvertTo-Json|Set-Content data/release-test.json
 $env:DAUYS_MIGRATION_TEST_URL='postgres://dauys@127.0.0.1:55432/'+$dauysDb+'?sslmode=disable'
 Invoke-Verified 'go-test' $dauysGo @('-C','backend','test','./...')
 Invoke-Verified 'go-vet' $dauysGo @('-C','backend','vet','./...')
 Invoke-Verified 'go-build' $dauysGo @('-C','backend','build','-trimpath','-o','bin/dauys-verify.exe','./cmd/server')
 $dauysPort=8081..8095|Where-Object {-not(Get-NetTCPConnection -State Listen -LocalPort $_ -ErrorAction SilentlyContinue)}|Select-Object -First 1
 if(-not $dauysPort){throw 'No unused test port from 8081 through 8095'}
 $env:DATABASE_URL=$env:DAUYS_MIGRATION_TEST_URL;$env:DEMO_MODE='false';$env:HOST='127.0.0.1';$env:PORT=[string]$dauysPort;$env:COOKIE_SECURE='false'
 $env:BASE_URL='http://127.0.0.1:'+$dauysPort;$env:APP_ORIGINS=$env:BASE_URL;$env:APP_PUBLIC_URL=''
 $env:UPLOAD_DIR=Join-Path $dauysOutput 'uploads';$env:DIST_DIR=Join-Path $dauysRoot 'dist';$env:DAUYS_ALLOW_TEST_WRITES='1'
 $dauysApi=Start-Process -FilePath $dauysExe -WorkingDirectory $dauysRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dauysOutput 'api-out.log') -RedirectStandardError (Join-Path $dauysOutput 'api-error.log')
 $dauysApiTicks=$dauysApi.StartTime.ToUniversalTime().Ticks
 $dauysReady=$false
 for($dauysAttempt=0;$dauysAttempt -lt 30;$dauysAttempt++){try{if((Invoke-RestMethod ($env:BASE_URL+'/api/health') -TimeoutSec 2).ok){$dauysReady=$true;break}}catch{};Start-Sleep -Milliseconds 250}
 if(-not $dauysReady){throw 'Isolated API did not start'}
 $dauysWindow=Get-Date
 foreach($dauysSuite in @('dataset','smoke','features','dashboard')){Invoke-Verified ('api-'+$dauysSuite) 'node' @('tests/api/'+$dauysSuite+'.mjs')}
 $dauysWait=[math]::Max(0,[math]::Ceiling(62-((Get-Date)-$dauysWindow).TotalSeconds))
 if($dauysWait -gt 0){Write-Host "Waiting $dauysWait seconds for the unchanged login rate-limit window";for($dauysSecond=0;$dauysSecond -lt $dauysWait;$dauysSecond++){Start-Sleep -Seconds 1}}
 foreach($dauysSuite in @('integration','workflow','business','release')){Invoke-Verified ('api-'+$dauysSuite) 'node' @('tests/api/'+$dauysSuite+'.mjs')}
 # The previous API group uses 13 logins. Two UI logins still fit the 15/min limit.
 if(-not $SkipBrowser){
  $dauysChromium=Get-ChildItem (Join-Path $env:LOCALAPPDATA 'ms-playwright') -Directory -Filter 'chromium-*'|Sort-Object Name -Descending|ForEach-Object {Join-Path $_.FullName 'chrome-win64/chrome.exe'}|Where-Object {Test-Path -LiteralPath $_}|Select-Object -First 1
  if(-not $dauysChromium){throw 'Install the Playwright Chromium browser first: npx playwright install chromium'}
  $dauysBrowserOutput=Join-Path $dauysRoot ('output/playwright/'+$dauysStamp);New-Item -ItemType Directory -Path $dauysBrowserOutput -Force|Out-Null
  $dauysBrowserConfig=Join-Path $dauysOutput 'browser-config.json'
  Write-UTF8 $dauysBrowserConfig (@{browser=@{browserName='chromium';launchOptions=@{executablePath=$dauysChromium;headless=$true};contextOptions=@{viewport=@{width=1440;height=1000};reducedMotion='reduce'}};outputDir=$dauysBrowserOutput}|ConvertTo-Json -Depth 8)
  $dauysFixture=Join-Path $dauysOutput 'preflight-proof.txt';'Dauys preflight attachment'|Set-Content -LiteralPath $dauysFixture
  $dauysFlow=Get-Content tests/browser/acceptance.js -Raw -Encoding UTF8
  foreach($dauysSub in @(@('__JS_QR_PATH__',(Join-Path $dauysRoot 'node_modules/jsqr/dist/jsQR.js')),@('__FIXTURE_PATH__',$dauysFixture),@('__OUTPUT_DIR__',$dauysBrowserOutput))){$dauysFlow=$dauysFlow.Replace($dauysSub[0],($dauysSub[1]|ConvertTo-Json -Compress))}
  $dauysFlowFile=Join-Path $dauysOutput 'browser-flow.js';Write-UTF8 $dauysFlowFile $dauysFlow
  $dauysCLI=@('--yes','--package','@playwright/cli','playwright-cli',('-s='+$dauysSession))
  Invoke-Verified 'browser-open' 'npx.cmd' ($dauysCLI+@('open',$env:BASE_URL,('--config='+$dauysBrowserConfig))) -Browser
  Invoke-Verified 'browser-snapshot' 'npx.cmd' ($dauysCLI+@('snapshot')) -Browser
  Invoke-Verified 'browser-flow' 'npx.cmd' ($dauysCLI+@('run-code',('--filename='+$dauysFlowFile))) -Browser
  $dauysReport.browserChecked=$true
 }
 $dauysAfter=Get-MainSnapshot
 if($dauysBefore -ne $dauysAfter){throw 'Working data changed during verification. Inspect concurrent user activity before submitting.'}
 $dauysReport.workingDataUnchanged=$true
 $dauysReport.status='PASS';$dauysSucceeded=$true
} catch {
 $dauysReport.status='FAIL';$dauysReport.error=$_.Exception.Message
 Write-Host ('FAIL '+$_.Exception.Message)
} finally {
 if(-not $SkipBrowser){& npx.cmd --yes --package '@playwright/cli' playwright-cli ('-s='+$dauysSession) close *> $null}
 if($dauysApi){$dauysOwned=Get-Process -Id $dauysApi.Id -ErrorAction SilentlyContinue;if($dauysOwned -and $dauysOwned.Path -eq $dauysExe -and $dauysOwned.StartTime.ToUniversalTime().Ticks -eq $dauysApiTicks){Stop-Process -Id $dauysOwned.Id;$dauysApi.WaitForExit(5000)|Out-Null}}
 if($dauysSucceeded -and $dauysCreatedDatabase -and -not $KeepDatabase -and $dauysDb -match '^dauys_workflow_release_\d{8}_\d{6}$'){
  & (Join-Path $dauysPg 'dropdb.exe') -h 127.0.0.1 -p 55432 -U dauys $dauysDb
  if($LASTEXITCODE -ne 0){$dauysReport.cleanup='Test database retained; cleanup failed'}else{$dauysReport.cleanup='Owned test database removed'}
 }
 foreach($dauysKey in $dauysKeys){[Environment]::SetEnvironmentVariable($dauysKey,$dauysPrevious[$dauysKey],'Process')}
 $dauysReport.finished=Get-Date -Format o
 $dauysReport|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $dauysOutput 'report.json')
 $dauysReport|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $dauysRoot 'data/verification-latest.json')
 Write-Host ('RESULT '+$dauysReport.status+'; API checks: '+$dauysReport.apiChecks+'; browser: '+$dauysReport.browserChecked)
 Write-Host ('Report: '+(Join-Path $dauysOutput 'report.json'))
}
if(-not $dauysSucceeded){exit 1}
