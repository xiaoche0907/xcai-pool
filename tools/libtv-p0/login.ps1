$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$accountDir = Join-Path $root '.local/libtv-p0/accounts/account-01'
$env:LIBTV_CONFIG_DIR = Join-Path $accountDir 'config'
# Never inherit a global token, debug logging, or a custom login endpoint.
foreach ($key in @('LIBTV_TOKEN', 'LIBTV_DEBUG', 'LIBTV_LOGIN_WEB_URL', 'LIBTV_LOGIN_WEB_PATH')) {
    [Environment]::SetEnvironmentVariable($key, $null, 'Process')
}
$binary = Get-ChildItem (Join-Path $root '.local/libtv-p0/bin') -Recurse -Filter libtv.exe | Select-Object -First 1
if (-not $binary) { throw 'LibTV CLI is not installed in this workspace.' }
Push-Location (Join-Path $accountDir 'work')
try {
    & $binary.FullName login web --open
    if ($LASTEXITCODE -ne 0) { throw "Official login failed: exit $LASTEXITCODE" }
} finally { Pop-Location }
