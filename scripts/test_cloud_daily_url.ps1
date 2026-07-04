param(
    [Parameter(Mandatory = $true)]
    [string]$Url
)

$ErrorActionPreference = "Stop"

$response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 20
if ($response.StatusCode -ne 200) {
    throw "Unexpected HTTP status: $($response.StatusCode)"
}

$json = $response.Content | ConvertFrom-Json
if (-not $json.generatedAt -or -not $json.items) {
    throw "Invalid daily report JSON. Expected generatedAt and items."
}

Write-Host "OK"
Write-Host "generatedAt: $($json.generatedAt)"
Write-Host "items: $($json.items.Count)"
