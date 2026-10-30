> **注意**：本目录脚本里的 `{{BRIDGE_DIR}}` / `{{BRIDGE_DEPLOY_DIR}}` 是占位符，
> 请替换成你自己的实际路径（例如 `D:\qq-bridge`），否则脚本跑不起来。
> 也可以用 `scripts/replace-placeholders.ps1` 一键替换。

# 电脑侧（可选）：让机器人"看手机"

不做这一步也能正常聊天，只是没有截图、发图、刷视频的能力。

## 原理

```
电脑：MuMu 模拟器 ←adb← phone-mcp(:8899) + serve-shots(:8898)
                                  ↑ 反向 SSH 隧道
服务器：DSH 通过 http://127.0.0.1:8899/mcp 调用
```

## 准备

1. **MuMu 模拟器**（或任意安卓模拟器），记下 adb 端口（MuMu 默认 `127.0.0.1:16384`）
2. **Node.js**（电脑上）
3. **phone-mcp**：来自 AI Companion Kit（MIT），自行获取后放到任意目录
4. **ffmpeg**（可选，用于压缩截图）：`npm i @ffmpeg-installer/win32-x64` 后把 `ffmpeg.exe` 拷到 `tools/`
5. **supergateway**：`npm i -g supergateway`
6. SSH 密钥（能免密登录服务器）

## 配置

依次修改这几个脚本顶部的变量（把 `<你的安装目录>` 换成你自己的路径）：

- `run-gateway.bat`：phone-mcp 脚本路径、PHONE_ADB、PHONE_FFMPEG、PHONE_SHOT_DIR
- `phone-mcp-daemon.ps1`：`$Root`、`$PhpMcp`、`$ServeJs`、`$AdbExe`、`$SshKey`、`$SshHost`
- `phone-tunnel.ps1`：`$key`、`$server`
- `phone-supervisor.ps1`：路径同上

## 启动

```bat
wscript.exe phone-mcp-daemon.vbs     :: 起守护（隧道 + 网关 + 截图服务）
wscript.exe phone-supervisor.vbs     :: 每 5 分钟巡检（可注册成计划任务）
```

注册开机自启（注册表 Run）：

```powershell
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' `
  -Name 'phone-mcp-http' -Value 'wscript.exe "<你的安装目录>\phone-mcp-daemon.vbs"'
```

## 服务器侧

`cordis.patch.yml` 里保留 `mcp-phone` 那段即可（指向 `http://127.0.0.1:8899/mcp`）。

## 注意

- **不要**让脚本自动启动模拟器——用户关掉就应该保持关闭
- 截图动辄 1.5MB，务必用 ffmpeg 压到 ~100KB 再传（脚本已内置）
- adb 调用一定要带超时，否则 adb 卡住会把整个守护进程拖死
