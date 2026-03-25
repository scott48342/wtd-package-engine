$ErrorActionPreference = 'Stop'

$name = 'Clawdbot Gateway'
$path = '\'

$task = Get-ScheduledTask -TaskName $name -TaskPath $path

$actions  = $task.Actions
$settings = $task.Settings

# Ensure it starts on boot.
$triggers = @(
  (New-ScheduledTaskTrigger -AtStartup)
)

# Run as the current user, but without requiring an interactive session.
# S4U runs whether user is logged on or not (no password prompt), but has limited network access.
$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType S4U -RunLevel Highest

$newTask = New-ScheduledTask -Action $actions -Trigger $triggers -Settings $settings -Principal $principal
Register-ScheduledTask -TaskName $name -TaskPath $path -InputObject $newTask -Force | Out-Null

Write-Host 'Updated task:'
Write-Host "  name:     $path$name"
Write-Host '  trigger:  AtStartup'
Write-Host "  runAs:    $user (S4U, highest)"
