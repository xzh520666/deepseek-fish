# phone-supervisor.ps1
# 每 5 分钟由计划任务调用，保证手机链路活着：
#   1) 守护进程 phone-mcp-daemon.ps1（管隧道 + 8899 + 8898）没在跑就拉起来
#   2) 守护进程"卡死"（进程在但 8899 连续两次不通）就杀掉重来
$ErrorActionPreference = 'SilentlyContinue'

$Log     = '{{BRIDGE_DIR}}\phone-supervisor.log'
$Vbs     = '{{BRIDGE_DIR}}\phone-mcp-daemon.vbs'
$Counter = '{{BRIDGE_DIR}}\phone-supervisor.state'

function Write-Log([string]$m) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Add-Content -Path $Log -Value $line -Encoding UTF8
  if ((Get-Item $Log).Length -gt 512KB) { Move-Item $Log "$Log.old" -Force }
}

function Test-Port([int]$p) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $t = $c.BeginConnect('127.0.0.1', $p, $null, $null)
    $ok = $t.AsyncWaitHandle.WaitOne(1200)
    if ($ok -and $c.Connected) { $c.Close(); return $true }
    $c.Close(); return $false
  } catch { return $false }
}

function Get-Daemons {
  Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
    Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -and $_.CommandLine -like '*-File*phone-mcp-daemon.ps1*' }
}

$daemons = @(Get-Daemons)
$mcpUp = Test-Port 8899

if ($daemons.Count -eq 0) {
  Write-Log 'daemon not running -> starting it'
  Remove-Item $Counter -Force -ErrorAction SilentlyContinue
  Start-Process -FilePath 'wscript.exe' -ArgumentList ('"{0}"' -f $Vbs) -WindowStyle Hidden
  return
}

if ($mcpUp) {
  Remove-Item $Counter -Force -ErrorAction SilentlyContinue
  return
}

# 进程活着但 8899 不通：可能只是正在重启；连续两次都这样就是卡死了
$strikes = 0
if (Test-Path $Counter) { $strikes = [int]((Get-Content $Counter -Raw) -replace '\D', '') }
$strikes++
Set-Content -Path $Counter -Value $strikes -Encoding UTF8

if ($strikes -lt 2) {
  Write-Log ("daemon alive but 8899 down (strike $strikes/2), will re-check in 5 min")
  return
}

Write-Log 'daemon looks hung (2 strikes) -> killing and restarting'
foreach ($d in $daemons) {
  try { & taskkill.exe /PID $d.ProcessId /T /F 2>&1 | Out-Null } catch {}
}
Start-Sleep -Seconds 3
Remove-Item $Counter -Force -ErrorAction SilentlyContinue
Start-Process -FilePath 'wscript.exe' -ArgumentList ('"{0}"' -f $Vbs) -WindowStyle Hidden
Write-Log 'daemon restarted after hang'
