param(
    [Parameter(Mandatory = $true)]
    [string]$Url
)

$root = Split-Path -Parent $PSScriptRoot
$config = Join-Path $root "web\config.js"
$escaped = $Url.Replace("\", "\\").Replace('"', '\"')

@"
window.FUND_ASSISTANT_CONFIG = {
  cloudDailyUrl: "$escaped"
};
"@ | Set-Content -Encoding UTF8 -Path $config

Write-Host "Updated cloud daily URL: $Url"
