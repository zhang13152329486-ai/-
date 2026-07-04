$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root "web"
$target = Join-Path $root "android-webview\app\src\main\assets"

if (!(Test-Path $target)) {
    New-Item -ItemType Directory -Path $target | Out-Null
}

Copy-Item -Path (Join-Path $source "*") -Destination $target -Recurse -Force
Write-Host "Synced web assets to $target"
