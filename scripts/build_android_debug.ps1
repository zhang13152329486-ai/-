$root = Split-Path -Parent $PSScriptRoot
$ErrorActionPreference = "Stop"
$javaHome = Join-Path $root ".build-tools\jdk-17.0.19+10"
$androidHome = Join-Path $root ".build-tools\android-sdk"
$gradle = Join-Path $root ".build-tools\gradle-8.11.1\bin\gradle.bat"
$project = Join-Path $root "android-webview"
$apk = Join-Path $project "app\build\outputs\apk\debug\app-debug.apk"
$dist = Join-Path $root "dist\FundAssistant-0.3.0-debug.apk"

if (!(Test-Path $gradle)) {
    Write-Host "Gradle not found. Keep the .build-tools directory or install Gradle manually."
    exit 1
}

$env:JAVA_HOME = (Resolve-Path $javaHome).Path
$env:ANDROID_HOME = (Resolve-Path $androidHome).Path
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:PATH"

powershell -ExecutionPolicy Bypass -File (Join-Path $root "scripts\sync-web-to-android.ps1")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $gradle -p $project assembleDebug --no-daemon
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (!(Test-Path (Join-Path $root "dist"))) {
    New-Item -ItemType Directory -Path (Join-Path $root "dist") | Out-Null
}
Copy-Item -Force $apk $dist
Write-Host "Built $dist"
