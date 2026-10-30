@echo off
rem run-shots.bat - read-only screenshot HTTP server on 8898, with logging.
rem Started hidden by phone-mcp-daemon.ps1. ASCII only on purpose.
set PHONE_SHOT_DIR={{BRIDGE_DIR}}\shots
set PHONE_SHOT_PORT=8898
set PATH=G:\nodejs;%PATH%
node "{{BRIDGE_DIR}}\serve-shots.js" >> "{{BRIDGE_DIR}}\serve-shots.log" 2>&1
