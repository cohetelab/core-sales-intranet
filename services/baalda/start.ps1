$ErrorActionPreference = 'Stop'
& docker compose --env-file "$PSScriptRoot/.env" -f "$PSScriptRoot/compose.yaml" up -d --wait --wait-timeout 120
if ($LASTEXITCODE -ne 0) { throw 'Baalda failed to start' }
