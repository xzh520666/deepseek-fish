# phone-mcp-daemon.ps1
# 一个守护进程管三件事（每 20 秒巡检一次）：
#   1) 反向 SSH 隧道：-R 8898 / -R 8899 / -R 15555（掉了就重连）
#   2) 8899 phone MCP 网关（supergateway，streamable-http，服务器 DSH 用）
#   3) 8898 截图只读 HTTP 服务（serve-shots.js，服务器 qq-bridge 取图发 QQ 用）
# 注意：绝不主动启动 MuMu 模拟器——用户关掉就是关掉，等他手动打开才接入 adb。

$ErrorActionPreference = 'SilentlyContinue'

$Root     = '{{BRIDGE_DIR}}'
$Log      = Join-Path $Root 'phone-mcp.log'
$OutLog   = Join-Path $Root 'phone-mcp.out.log'
$ErrLog   = Join-Path $Root 'phone-mcp.err.log'
$ShotsLog = Join-Path $Root 'serve-shots.log'
$ShotErr  = Join-Path $Root 'serve-shots.err.log'
$SgCmd    = 'C:\Users\30675\AppData\Roaming\npm\supergateway.cmd'
$PhpMcp   = '{{BRIDGE_DEPLOY_DIR}}\kit\ai-companion-kit-main\packages\phone-mcp\src\phone-mcp.js'
$ServeJs  = '{{BRIDGE_DIR}}\serve-shots.js'
$NodeExe  = 'G:\nodejs\node.exe'
$GatewayBat = '{{BRIDGE_DIR}}\run-gateway.bat'
$ShotsBat   = '{{BRIDGE_DIR}}\run-shots.bat'
$ShotDir  = '{{BRIDGE_DIR}}\shots'
$AdbExe   = 'G:\Program Files\Netease\MuMu\nx_main\adb.exe'
$McpPort  = 8899
$ShotPort = 8898
$DevAddr  = '127.0.0.1:16384'
$SshKey   = '{{BRIDGE_DEPLOY_DIR}}\alibabacloud_ed25519'
$SshHost  = 'root@{{SERVER_IP}}'

$env:PATH = 'G:\nodejs;' + $env:PATH
$env:PHONE_ADB = $AdbExe
$env:PHONE_FFMPEG = '{{BRIDGE_DIR}}\tools\ffmpeg.exe'
$env:PHONE_SHOT_DIR = $ShotDir
$env:PHONE_SHOT_PORT = "$ShotPort"
$env:PHONE_SHOT_URL_BASE = "http://127.0.0.1:$ShotPort"

New-Item -ItemType Directory -Force -Path $ShotDir | Out-Null

function Write-Log([string]$msg) {
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
  Add-Content -Path $Log -Value $line -Encoding UTF8
  if ((Get-Item $Log).Length -gt 2MB) { Move-Item $Log "$Log.old" -Force }
}

function Test-Port([int]$p) {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $t = $c.BeginConnect('127.0.0.1', $p, $null, $null)
    $ok = $t.AsyncWaitHandle.WaitOne(800)
    if ($ok -and $c.Connected) { $c.Close(); return $true }
    $c.Close(); return $false
  } catch { return $false }
}

# 单实例保护：重复启动（开机自启 + 计划任务 + 手动）时只保留一个守护进程
$mutex = New-Object System.Threading.Mutex($false, 'Global\qq-phone-mcp-daemon-singleton')
if (-not $mutex.WaitOne(0)) {
  exit 0
}

Write-Log "daemon started (pid $PID)"

# 只在「MuMu 已经由用户手动启动」时才接入 adb。
# 绝不主动拉起模拟器：用户关掉 MuMu 就应该保持关闭，等他自己开。
$lastDeviceState = $null

# adb 有可能卡住（server 状态异常时 connect 会一直不返回），
# 所以永远带超时调用，绝不让自己被一个卡住的 adb 卡死整个守护循环。
function Invoke-AdbConnect {
  try {
    $p = Start-Process -FilePath $AdbExe -ArgumentList @('connect', $DevAddr) -WindowStyle Hidden -PassThru -ErrorAction Stop
    if (-not $p.WaitForExit(8000)) {
      try { $p.Kill() } catch {}
      Write-Log 'adb connect timed out (killed)'
      return $false
    }
    return ($p.ExitCode -eq 0)
  } catch {
    Write-Log ('adb connect error: ' + $_.Exception.Message)
    return $false
  }
}

$script:lastAdbAt = 0
function Ensure-Device {
  if (-not (Test-Path $AdbExe)) { return }
  $emulatorUp = Test-Port 16384
  if ($emulatorUp) {
    # 模拟器在跑：确保 adb 连上。最多每 2 分钟连一次，
    # 避免频繁拉起 adb 进程（每次都会有一瞬间的控制台活动，用户看着碍事）。
    $nowSec = [int](Get-Date -UFormat %s)
    if (($nowSec - $script:lastAdbAt) -ge 120) {
      [void](Invoke-AdbConnect)
      $script:lastAdbAt = $nowSec
    }
    if ($lastDeviceState -ne 'up') { Write-Log 'emulator is running -> adb connected'; $script:lastDeviceState = 'up' }
  } else {
    if ($lastDeviceState -ne 'down') { Write-Log 'emulator is off (user closed it) -> staying idle, will connect when it comes back'; $script:lastDeviceState = 'down' }
  }
}

# 清理旧截图，避免占满磁盘（保留 2 天）
function Clear-OldShots {
  try {
    Get-ChildItem -Path $ShotDir -File -ErrorAction SilentlyContinue |
      Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-2) } |
      Remove-Item -Force -ErrorAction SilentlyContinue
  } catch {}
}

# 反向隧道：服务器靠它访问 8898/8899（以及备用的 15555）
function Ensure-Tunnel {
  $alive = Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match '8898:127\.0\.0\.1:8898' -and $_.CommandLine -match '8899:127\.0\.0\.1:8899' }
  if ($alive) { return }
  try {
    Start-Process -FilePath 'ssh.exe' -ArgumentList @(
      '-i', "`"$SshKey`"", '-N',
      '-R', '8898:127.0.0.1:8898',
      '-R', '8899:127.0.0.1:8899',
      '-R', '15555:127.0.0.1:16384',
      '-o', 'StrictHostKeyChecking=accept-new',
      '-o', 'ServerAliveInterval=30',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'ExitOnForwardFailure=yes',
      $SshHost
    ) -WindowStyle Hidden
    Write-Log 'tunnel (re)started (8898 + 8899 + 15555)'
  } catch {
    Write-Log ('tunnel start failed: ' + $_.Exception.Message)
  }
}

$loop = 0
while ($true) {
  $loop++
  Ensure-Tunnel
  Ensure-Device
  if ($loop % 30 -eq 1) { Clear-OldShots }

  # ---- 8899: phone MCP 网关 ----
  # 用 .bat 包一层并用 cmd 重定向日志（不要用 Start-Process 的 -RedirectStandardOutput：
  # 两个实例同时重定向同一个日志文件时会互相锁住，实测会把守护进程卡死）
  if (-not (Test-Port $McpPort)) {
    Write-Log 'port 8899 down -> restarting phone-mcp gateway'
    if (Test-Path $AdbExe) { & $AdbExe connect $DevAddr 2>&1 | Out-Null }
    try {
      Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', ('"{0}"' -f $GatewayBat) -WindowStyle Hidden
      Start-Sleep -Seconds 8
      if (Test-Port $McpPort) { Write-Log 'gateway is up on 8899' }
      else { Write-Log 'gateway did not come up, retry in 20s' }
    } catch {
      Write-Log ('gateway start failed: ' + $_.Exception.Message)
    }
  }

  # ---- 8898: 截图只读服务 ----
  if (-not (Test-Port $ShotPort)) {
    Write-Log 'port 8898 down -> restarting serve-shots'
    try {
      Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', ('"{0}"' -f $ShotsBat) -WindowStyle Hidden
      Start-Sleep -Seconds 4
      if (Test-Port $ShotPort) { Write-Log 'serve-shots is up on 8898' }
      else { Write-Log 'serve-shots did not come up, retry in 20s' }
    } catch {
      Write-Log ('serve-shots start failed: ' + $_.Exception.Message)
    }
  }

  Start-Sleep -Seconds 20
}
