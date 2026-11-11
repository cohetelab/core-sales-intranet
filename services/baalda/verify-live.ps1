param([switch]$CheckPersistence)
$ErrorActionPreference = 'Stop'
$localDir = Join-Path $PSScriptRoot 'local'
New-Item -ItemType Directory -Force $localDir | Out-Null
& docker image inspect core-baalda-checks:0.1.112 --format '{{.Id}}' *> $null
if ($LASTEXITCODE -ne 0) {
    & docker compose -p core-baalda-verification -f "$PSScriptRoot/verify.compose.yaml" build tests
    if ($LASTEXITCODE -ne 0) { throw 'Verification image build failed' }
}
$scriptArgs = @('verify-live.mjs')
if ($CheckPersistence) { $scriptArgs += '--persistence' }
& docker run --rm --network core-baalda_default --mount "type=bind,source=$PSScriptRoot/verify-live.mjs,target=/repo/app/apps/server/verify-live.mjs,readonly" --mount "type=bind,source=$localDir,target=/evidence" -w /repo/app/apps/server core-baalda-checks:0.1.112 node @scriptArgs
if ($LASTEXITCODE -ne 0) { throw 'Live Baalda verification failed' }
