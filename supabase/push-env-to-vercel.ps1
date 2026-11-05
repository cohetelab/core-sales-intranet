# Copies the 4 outreach env vars from .env.local to Vercel (Production) for the linked project.
# Values are read on your PC and sent straight to Vercel. Nothing is printed.
# ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 without BOM.

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectDir '.env.local'
Set-Location $projectDir

if (-not (Test-Path $envFile)) { Write-Host '.env.local not found.' -ForegroundColor Red; exit 1 }

$names = 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'OUTREACH_API_KEY', 'OUTREACH_ADMIN_PASSWORD'
$values = @{}
foreach ($line in Get-Content $envFile -Encoding UTF8) {
  foreach ($n in $names) {
    if ($line.StartsWith("$n=")) { $values[$n] = $line.Substring($n.Length + 1).Trim() }
  }
}

$missing = $names | Where-Object { -not $values[$_] }
if ($missing) {
  Write-Host ('Missing in .env.local: ' + ($missing -join ', ')) -ForegroundColor Red
  exit 1
}

# The Vercel CLI prints its banner to stderr. Windows PowerShell 5.1 treats that as an error
# when ErrorActionPreference is Stop, so switch to Continue and judge success by the exit code.
$ErrorActionPreference = 'Continue'
foreach ($n in $names) {
  # Remove the old value first (it is fine if it does not exist), then add the new one.
  vercel env rm $n production --yes 2>$null | Out-Null
  $values[$n] | vercel env add $n production 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "OK  $n" -ForegroundColor Green }
  else { Write-Host "FAILED  $n (exit $LASTEXITCODE)" -ForegroundColor Red }
}

Write-Host ''
Write-Host 'Done. Now tell the assistant, and it will deploy.'
