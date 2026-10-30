# replace-placeholders.ps1
# 一键把仓库里的占位符替换成你的真实路径 / QQ / 服务器地址
# 用法（在仓库根目录）：
#   powershell -ExecutionPolicy Bypass -File scripts\replace-placeholders.ps1 `
#     -BridgeDir 'D:\qq-bridge' -BridgeDeployDir 'D:\qq-bridge-deploy' `
#     -OwnerQQ '123456789' -ServerIp '1.2.3.4'
param(
  [string]$BridgeDir = '',
  [string]$BridgeDeployDir = '',
  [string]$OwnerQQ = '',
  [string]$ServerIp = ''
)

$root = Split-Path -Parent $PSScriptRoot
$files = Get-ChildItem $root -Recurse -File | Where-Object {
  $_.Extension -in '.ps1', '.bat', '.vbs', '.yml', '.yaml', '.json', '.md', '.sh', '.js', '.mjs'
}

$pairs = @()
if ($BridgeDir)       { $pairs += @('{{BRIDGE_DIR}}', $BridgeDir) }
if ($BridgeDeployDir) { $pairs += @('{{BRIDGE_DEPLOY_DIR}}', $BridgeDeployDir) }
if ($OwnerQQ)         { $pairs += @('{{OWNER_QQ}}', $OwnerQQ) }
if ($ServerIp)        { $pairs += @('{{SERVER_IP}}', $ServerIp) }

if (-not $pairs.Count) {
  Write-Host '没有传任何参数。示例：' -ForegroundColor Yellow
  Write-Host "  -BridgeDir 'D:\qq-bridge' -OwnerQQ '123456789' -ServerIp '1.2.3.4'"
  exit 1
}

$changed = 0
foreach ($f in $files) {
  $text = Get-Content $f.FullName -Raw -Encoding UTF8
  $orig = $text
  for ($i = 0; $i -lt $pairs.Count; $i += 2) {
    $text = $text.Replace($pairs[$i], $pairs[$i + 1])
  }
  if ($text -ne $orig) {
    [System.IO.File]::WriteAllText($f.FullName, $text, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host "  已替换: $($f.FullName.Replace($root, ''))"
    $changed++
  }
}
Write-Host "`n完成，共修改 $changed 个文件。" -ForegroundColor Green
Write-Host '注意：scripts/install.sh 里的路径是给 Linux 服务器用的，不要替换成 Windows 路径。'
