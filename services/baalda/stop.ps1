$ErrorActionPreference = 'Stop'
# Stop containers without removing the database volume.
& docker compose --env-file "$PSScriptRoot/.env" -f "$PSScriptRoot/compose.yaml" stop
if ($LASTEXITCODE -ne 0) { throw 'Baalda failed to stop' }
