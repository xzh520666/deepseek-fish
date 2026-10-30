' phone-supervisor.vbs - run phone-supervisor.ps1 fully hidden (no console window / no flash)
Set sh = CreateObject("WScript.Shell")
sh.Run "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""{{BRIDGE_DIR}}\phone-supervisor.ps1""", 0, False