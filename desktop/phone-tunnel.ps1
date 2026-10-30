# phone-tunnel.ps1 — 维持到服务器的反向 SSH 隧道
#   -R 8899:127.0.0.1:8899   phone-mcp HTTP 服务（supergateway，供服务器 DSH 调用）
#   -R 8898:127.0.0.1:8898   截图只读服务（serve-shots，供服务器 qq-bridge 取图发 QQ）
#   -R 15555:127.0.0.1:16384 MuMu adb（备用）
$key = '{{BRIDGE_DEPLOY_DIR}}\alibabacloud_ed25519'
$server = 'root@{{SERVER_IP}}'
$logFile = '{{BRIDGE_DEPLOY_DIR}}\phone-tunnel.log'

function Write-Log([string]$m) {
  $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m
  Add-Content -Path $logFile -Value $line -Encoding UTF8
}

Write-Log '=== phone-tunnel begin ==='
while ($true) {
  try {
    $existing = Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match '8898:127.0.0.1:8898' -and $_.CommandLine -match '8899:127.0.0.1:8899' }
    if (-not $existing) {
      # 旧的（没有 8898 的）隧道先清掉，避免端口占用冲突
      Get-CimInstance Win32_Process -Filter "Name='ssh.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -match '8899:127.0.0.1:8899' -and $_.CommandLine -notmatch '8898:127.0.0.1:8898' } |
        ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }
      Start-Process -FilePath 'ssh.exe' -ArgumentList "-i `"$key`" -N -R 8898:127.0.0.1:8898 -R 8899:127.0.0.1:8899 -R 15555:127.0.0.1:16384 -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ExitOnForwardFailure=yes $server" -WindowStyle Hidden
      Write-Log 'tunnel started (8898 + 8899 + 15555)'
    }
  } catch {
    Write-Log ("error: " + $_.Exception.Message)
  }
  Start-Sleep -Seconds 60
}
