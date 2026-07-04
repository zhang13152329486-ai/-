$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (!(Test-Path "node_modules\electron")) {
    npm.cmd install
}

$env:CSC_IDENTITY_AUTO_DISCOVERY = "false"
npm.cmd run build:win

Write-Host "Windows desktop build finished. Check the dist directory."
