# Changes only OUTREACH_ADMIN_PASSWORD in .env.local. Other lines stay as they are.
# This file contains no secret values. (ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 without BOM.)

$ErrorActionPreference = 'Stop'
$envFile = Join-Path (Split-Path -Parent $PSScriptRoot) '.env.local'

if (-not (Test-Path $envFile)) {
  Write-Host '.env.local not found. Run setup-outreach-env.ps1 first.' -ForegroundColor Red
  exit 1
}

Write-Host ''
Write-Host 'Type the new screen login password and press Enter.'
Write-Host 'Nothing is shown while you type. That is normal.'
$a = Read-Host -AsSecureString 'new password'
$b = Read-Host -AsSecureString 'new password again'
function Plain($s) { [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s)) }
$p1 = Plain $a
$p2 = Plain $b

if ($p1 -ne $p2) { Write-Host 'The two passwords differ. Run this again.' -ForegroundColor Red; exit 1 }
if ($p1.Length -lt 8) { Write-Host 'Use at least 8 characters.' -ForegroundColor Red; exit 1 }
if ($p1 -match '[\r\n]') { Write-Host 'No line breaks allowed.' -ForegroundColor Red; exit 1 }

$lines = Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -notlike 'OUTREACH_ADMIN_PASSWORD=*' }
Set-Content -Path $envFile -Value ($lines + "OUTREACH_ADMIN_PASSWORD=$p1") -Encoding UTF8

Write-Host ''
Write-Host 'Done. The screen login password was changed.' -ForegroundColor Green
Write-Host 'Restart the dev server for it to take effect (the assistant will do that).'
