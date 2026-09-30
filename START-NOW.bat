@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage.ps1" -Action stop >nul
wscript "%~dp0start-hidden.vbs"
echo Bridge dijalankan di background. Log: bridge\bridge.log
timeout /t 2 /nobreak >nul
