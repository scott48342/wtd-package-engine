$ErrorActionPreference = 'Stop'

$name = 'Clawdbot Gateway'
$path = '\'

$task = Get-ScheduledTask -TaskName $name -TaskPath $path

$actions  = $task.Actions
$settings = $task.Settings

$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup),
  (New-ScheduledTaskTrigger -AtLogOn)
)

# Run as SYSTEM so it can start at boot before interactive logon.
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

$newTask = New-ScheduledTask -Action $actions -Trigger $triggers -Settings $settings -Principal $principal

Register-ScheduledTask -TaskName $name -TaskPath $path -InputObject $newTask -Force | Out-Null

Write-Host 'Updated task:'
Write-Host "  name:      $path$name"
Write-Host '  triggers:  AtStartup + AtLogOn'
Write-Host '  runAs:     SYSTEM (highest)'
