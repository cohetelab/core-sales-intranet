$ErrorActionPreference = 'Stop'
$backupDir = Join-Path $PSScriptRoot 'backups'
New-Item -ItemType Directory -Force $backupDir | Out-Null
$name = 'baalda-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump'
$compose = @('compose', '--env-file', "$PSScriptRoot/.env", '-f', "$PSScriptRoot/compose.yaml")
# Keep binary output out of the Windows PowerShell text pipeline.
& docker @compose exec -T postgres pg_dump -U baalda -d baalda -Fc -f /tmp/baalda-backup.dump
if ($LASTEXITCODE -ne 0) { throw 'Database dump failed' }
& docker @compose cp postgres:/tmp/baalda-backup.dump (Join-Path $backupDir $name)
if ($LASTEXITCODE -ne 0) { throw 'Backup copy failed' }
Write-Output (Join-Path $backupDir $name)
