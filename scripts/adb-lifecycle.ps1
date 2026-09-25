<#
.SYNOPSIS
  Lightweight ADB lifecycle helper for ReTimer device checks (Issue #12).

.DESCRIPTION
  Wraps the exact ADB sequence proven in the Issue #11 device matrix:
  launch, HOME/resume, am kill, relaunch, pid inspection, and filtered
  logcat. Read-only except for the action you request. This script proves
  nothing by itself - it only performs reliable device actions and reports
  observations; verdicts stay with the human/device matrix.

.EXAMPLE
  .\scripts\adb-lifecycle.ps1 -Action status
  .\scripts\adb-lifecycle.ps1 -Action kill
  .\scripts\adb-lifecycle.ps1 -Action fatal
#>
param(
  [ValidateSet('status', 'launch', 'home', 'resume', 'kill', 'relaunch', 'force-stop', 'fatal')]
  [string]$Action = 'status',
  [string]$Package = 'com.retimer.app',
  [string]$Adb = (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe')
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $Adb)) {
  $fallback = Get-Command adb -ErrorAction SilentlyContinue
  if ($null -eq $fallback) { throw "adb not found at $Adb and not on PATH" }
  $Adb = $fallback.Source
}

function Invoke-Adb([string[]]$Arguments) {
  return & $Adb @Arguments
}

function Get-Pid() {
  $out = Invoke-Adb @('shell', 'pidof', $Package) | Out-String
  return $out.Trim()
}

switch ($Action) {
  'status' {
    Invoke-Adb @('devices')
    $appPid = Get-Pid
    if ($appPid) { "RUNNING pid=$appPid" } else { 'NOT RUNNING (empty pidof)' }
  }
  'launch' {
    Invoke-Adb @('shell', 'monkey', '-p', $Package, '-c', 'android.intent.category.LAUNCHER', '1') | Out-Null
    Start-Sleep -Seconds 4
    $appPid = Get-Pid
    if ($appPid) { "LAUNCHED pid=$appPid" } else { 'LAUNCHED but pidof empty (check screen)' }
  }
  'home' {
    Invoke-Adb @('shell', 'input', 'keyevent', 'KEYCODE_HOME') | Out-Null
    'HOME sent (app backgrounded)'
  }
  'resume' {
    Invoke-Adb @('shell', 'monkey', '-p', $Package, '-c', 'android.intent.category.LAUNCHER', '1') | Out-Null
    Start-Sleep -Seconds 3
    $appPid = Get-Pid
    if ($appPid) { "RESUMED pid=$appPid" } else { 'RESUMED but pidof empty (check screen)' }
  }
  'kill' {
    Invoke-Adb @('shell', 'input', 'keyevent', 'KEYCODE_HOME') | Out-Null
    Start-Sleep -Seconds 3
    Invoke-Adb @('shell', 'am', 'kill', $Package) | Out-Null
    Start-Sleep -Seconds 2
    $appPid = Get-Pid
    if ($appPid) {
      "AM KILL did not kill (pid=$appPid still alive; emulator-dependent - see Issue #11)"
    } else {
      'KILLED (pidof empty) - genuine am-kill process death achieved'
    }
  }
  'relaunch' {
    Invoke-Adb @('shell', 'monkey', '-p', $Package, '-c', 'android.intent.category.LAUNCHER', '1') | Out-Null
    Start-Sleep -Seconds 5
    $appPid = Get-Pid
    if ($appPid) { "RELAUNCHED pid=$appPid" } else { 'RELAUNCHED but pidof empty (check screen)' }
  }
  'force-stop' {
    Invoke-Adb @('shell', 'am', 'force-stop', $Package) | Out-Null
    Start-Sleep -Seconds 2
    $appPid = Get-Pid
    if ($appPid) { "force-stop did not kill (pid=$appPid)" } else { 'FORCE-STOPPED (pidof empty; stronger than OS kill for state, weaker for alarms - label accordingly)' }
  }
  'fatal' {
    $lines = Invoke-Adb @('logcat', '-d') | Select-String -Pattern 'FATAL|AndroidRuntime' | Select-Object -Last 15
    if ($lines) { $lines | ForEach-Object { $_.Line } } else { 'no FATAL/AndroidRuntime lines in logcat buffer' }
    'NOTE: bluetooth/chrome tombstones pre-exist on the emulator and are unrelated to ReTimer.'
  }
}
