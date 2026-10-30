@echo off
rem run-embed.bat - local embedding HTTP server on 8897, with logging.
rem Started hidden by phone-mcp-daemon.ps1. ASCII only on purpose.
set EMBED_MODEL_PATH={{BRIDGE_DIR}}\models\bge-small-zh-v1.5
set EMBED_PORT=8897
set PATH=G:\nodejs;%PATH%
node "{{BRIDGE_DIR}}\embed-server.js" >> "{{BRIDGE_DIR}}\embed-server.log" 2>&1
