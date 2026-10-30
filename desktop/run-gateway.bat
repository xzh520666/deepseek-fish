@echo off
rem run-gateway.bat - launch the phone MCP gateway (supergateway on 8899) with logging.
rem Started hidden by phone-mcp-daemon.ps1. ASCII only on purpose.
set PHONE_ADB=G:\Program Files\Netease\MuMu\nx_main\adb.exe
set PHONE_FFMPEG={{BRIDGE_DIR}}\tools\ffmpeg.exe
set PHONE_SHOT_DIR={{BRIDGE_DIR}}\shots
set PHONE_SHOT_PORT=8898
set PHONE_SHOT_URL_BASE=http://127.0.0.1:8898
set PATH=G:\nodejs;%PATH%
"C:\Users\30675\AppData\Roaming\npm\supergateway.cmd" --stdio "node {{BRIDGE_DEPLOY_DIR}}\kit\ai-companion-kit-main\packages\phone-mcp\src\phone-mcp.js" --outputTransport streamableHttp --port 8899 --host 127.0.0.1 --streamableHttpPath /mcp >> "{{BRIDGE_DIR}}\phone-mcp.out.log" 2>&1
