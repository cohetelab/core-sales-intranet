$ErrorActionPreference = 'Stop'
# A separate Compose project and ephemeral database: never run resetDb on pgdata.
& docker compose -p core-baalda-verification -f "$PSScriptRoot/verify.compose.yaml" up --build --abort-on-container-exit --exit-code-from tests
if ($LASTEXITCODE -ne 0) { throw 'Baalda regression verification failed' }
