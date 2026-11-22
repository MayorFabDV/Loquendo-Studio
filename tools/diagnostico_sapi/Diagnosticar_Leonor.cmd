@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Diagnosticar_Leonor.ps1" -StudioPath "%~1"
if errorlevel 1 pause
endlocal
