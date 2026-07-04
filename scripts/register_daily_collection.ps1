$root = Split-Path -Parent $PSScriptRoot
$python = Get-Command python -ErrorAction SilentlyContinue

if (!$python) {
    Write-Host "Python is missing. Install Python or adjust this script to your Python path."
    exit 1
}

$taskName = "基金投资建议助手-每日采集"
$script = Join-Path $root "scripts\collect_daily.py"
$action = New-ScheduledTaskAction -Execute $python.Source -Argument "`"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At 8:10am
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "每天采集国内政策、行业新闻和基金投资辅助信号。" -Force
Write-Host "Registered task: $taskName, daily 08:10"
