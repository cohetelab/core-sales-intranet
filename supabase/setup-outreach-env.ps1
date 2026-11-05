# Writes the DM outreach env vars into .env.local in one step.
# Asks only for the Supabase secret key and generates the other values.
# This file contains no secret values. (ASCII only on purpose: Windows PowerShell 5.1 misreads UTF-8 without BOM.)

$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $projectDir '.env.local'

function New-Secret([int]$bytes) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  ([BitConverter]::ToString($b) -replace '-', '').ToLower()
}

# Project URL: keep the one already in .env.local, otherwise ask (it is not hard-coded in this repo).
$projectUrl = $null
if (Test-Path $envFile) {
  $line = Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -like 'SUPABASE_URL=*' } | Select-Object -First 1
  if ($line) { $projectUrl = $line.Substring('SUPABASE_URL='.Length).Trim() }
}
if (-not $projectUrl) {
  Write-Host ''
  Write-Host 'Paste your Supabase Project URL (https://xxxx.supabase.co) and press Enter.'
  $projectUrl = (Read-Host 'project url').Trim()
}
if ($projectUrl -notmatch '^https://[a-z0-9-]+\.supabase\.co/?$') {
  Write-Host 'That does not look like a Supabase project URL. Run this again.' -ForegroundColor Red
  exit 1
}
$projectUrl = $projectUrl.TrimEnd('/')

Write-Host ''
Write-Host 'Paste your Supabase secret key (starts with sb_secret_) and press Enter.'
Write-Host 'Nothing is shown while you paste. That is normal.'
$secure = Read-Host -AsSecureString 'secret key'
$secret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)).Trim()

if (-not $secret.StartsWith('sb_secret_')) {
  Write-Host ''
  Write-Host 'The key does not start with sb_secret_. Check it and run this again.' -ForegroundColor Red
  exit 1
}

$apiKey = New-Secret 24
$password = New-Secret 6

# Drop old lines with the same names, then append fresh ones. Other lines are kept.
$names = 'SUPABASE_URL', 'SUPABASE_SECRET_KEY', 'OUTREACH_API_KEY', 'OUTREACH_ADMIN_PASSWORD'
$kept = @()
if (Test-Path $envFile) {
  $kept = Get-Content $envFile -Encoding UTF8 | Where-Object {
    $line = $_
    -not ($names | Where-Object { $line -like "$_=*" })
  }
}
$new = @(
  "SUPABASE_URL=$projectUrl"
  "SUPABASE_SECRET_KEY=$secret"
  "OUTREACH_API_KEY=$apiKey"
  "OUTREACH_ADMIN_PASSWORD=$password"
)
Set-Content -Path $envFile -Value ($kept + '' + $new) -Encoding UTF8

Write-Host ''
Write-Host 'Done. Saved to .env.local' -ForegroundColor Green
Write-Host ''
Write-Host "Login password for the screen : $password"
Write-Host "API key for Aside             : $apiKey"
Write-Host ''
Write-Host 'Write these two down. They are not shown again after you close this window.'
Write-Host 'You can always read them in the .env.local file.'
