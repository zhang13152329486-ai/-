$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (!(Test-Path "node_modules\electron")) {
    Write-Host "Installing desktop dependencies..."
    npm.cmd install
}

npm.cmd run desktop
