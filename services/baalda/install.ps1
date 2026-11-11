$ErrorActionPreference = 'Stop'
$revision = '90929b5a68de3f5347cbf2084ee672dd41264234'
$sourceDir = Join-Path $PSScriptRoot 'upstream'
if (!(Test-Path $sourceDir)) {
    git clone --no-checkout https://github.com/naveedharri/baalda.git $sourceDir
    if ($LASTEXITCODE -ne 0) { throw 'Baalda source download failed' }
    git -C $sourceDir checkout --detach $revision
    if ($LASTEXITCODE -ne 0) { throw 'Baalda checkout failed' }
}
$actualRevision = git -C $sourceDir rev-parse HEAD
if ($actualRevision -ne $revision) { throw "Unexpected Baalda revision: $actualRevision" }
$envFile = Join-Path $PSScriptRoot '.env'
if (!(Test-Path $envFile)) {
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    function New-Secret {
        $bytes = New-Object byte[] 32
        $rng.GetBytes($bytes)
        return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
    }
    $values = "POSTGRES_PASSWORD=$(New-Secret)`nJWT_SECRET=$(New-Secret)`n"
    [IO.File]::WriteAllText($envFile, $values, (New-Object Text.UTF8Encoding $false))
    $rng.Dispose()
}
& docker compose --env-file $envFile -f (Join-Path $PSScriptRoot 'compose.yaml') up -d --build --wait --wait-timeout 240
if ($LASTEXITCODE -ne 0) { throw 'Baalda installation failed; inspect docker compose logs' }
Write-Output 'Baalda ready: http://localhost:4310'
