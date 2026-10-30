' phone-mcp-daemon.vbs - start the phone MCP supervisor hidden (no console window)
Set sh = CreateObject("WScript.Shell")
sh.Run "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{{BRIDGE_DIR}}\phone-mcp-daemon.ps1""", 0, False