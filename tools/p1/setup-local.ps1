$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Push-Location $root
try {
    if ((& node --version) -notmatch '^v24\.') { throw 'Use Node 24.x, then retry.' }
    if (Test-Path -LiteralPath '.env') { throw '.env already exists; reuse it. Setup never overwrites local keys or account configuration.' }
    New-Item -ItemType Directory -Force '.local/framepool-p1' | Out-Null
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
    $listener.Start()
    $port = $listener.LocalEndpoint.Port
    $listener.Stop()
    function New-PrivateHex([int]$Length) {
        $bytes = New-Object byte[] $Length
        $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
        try {
            $rng.GetBytes($bytes)
            return [BitConverter]::ToString($bytes).Replace('-', '')
        } finally { $rng.Dispose() }
    }
    $dbPassword = New-PrivateHex 24
    $adminKey = New-PrivateHex 32
    $viewerKey = New-PrivateHex 32
    @('HOST=127.0.0.1', "PORT=$port", "DATABASE_URL=postgres://framepool:${dbPassword}@127.0.0.1:55432/framepool", "ADMIN_API_KEY=$adminKey", "VIEWER_API_KEY=$viewerKey", 'GENERATION_ENABLED=false', 'LIBTV_BINARY=.local/libtv-p0/bin/libtv-win-x64/libtv.exe', 'LIBTV_ACCOUNT_ROOT=.local/libtv-p0/accounts') | Set-Content -Encoding utf8 '.env'
    "FRAMEPOOL_DB_PASSWORD=$dbPassword" | Set-Content -Encoding utf8 '.local/framepool-p1/compose.env'
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    & icacls '.env' /inheritance:r /grant:r "${identity}:F" 'SYSTEM:F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict .env ACL.' }
    & icacls '.local/framepool-p1' /inheritance:r /grant:r "${identity}:(OI)(CI)F" 'SYSTEM:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Could not restrict local runtime ACL.' }
    Write-Output "Created private environment for http://127.0.0.1:$port. API keys are available only in .env."
} finally { Pop-Location }
