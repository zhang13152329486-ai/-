$java = Get-Command java -ErrorAction SilentlyContinue
$gradle = Get-Command gradle -ErrorAction SilentlyContinue
$androidHome = $env:ANDROID_HOME
$androidSdkRoot = $env:ANDROID_SDK_ROOT

Write-Host "Android build environment check"
Write-Host "Java:       " ($(if ($java) { $java.Source } else { "missing" }))
Write-Host "Gradle:     " ($(if ($gradle) { $gradle.Source } else { "missing" }))
Write-Host "ANDROID_HOME:     " ($(if ($androidHome) { $androidHome } else { "missing" }))
Write-Host "ANDROID_SDK_ROOT: " ($(if ($androidSdkRoot) { $androidSdkRoot } else { "missing" }))

if (!$java -or !$gradle -or (!$androidHome -and !$androidSdkRoot)) {
    Write-Host ""
    Write-Host "Install Android Studio with JDK 17+ and Android SDK Platform 36, or install Java/Gradle/SDK manually."
    exit 1
}

Write-Host ""
Write-Host "Environment looks ready. Run: cd android-webview; gradle assembleDebug"
