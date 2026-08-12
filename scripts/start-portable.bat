@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0portable-server.ps1" -Root "%~dp0www" -Port 4173
if errorlevel 1 pause
