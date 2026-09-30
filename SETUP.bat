@echo off
setlocal
cd /d "%~dp0"
title VoraToon Presence - Setup

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js belum terinstall.
  echo Download dulu di https://nodejs.org lalu jalankan SETUP.bat lagi.
  pause
  exit /b 1
)

echo [1/3] Install dependencies...
pushd bridge
if exist node_modules rmdir /s /q node_modules
call npm install --omit=dev
if errorlevel 1 (
  echo [ERROR] npm install gagal.
  popd
  pause
  exit /b 1
)
popd

echo.
echo [2/3] Pasang autostart (jalan otomatis saat login Windows)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage.ps1" -Action install

echo.
echo [3/3] Menjalankan bridge di background...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0manage.ps1" -Action stop >nul
wscript "%~dp0start-hidden.vbs"
timeout /t 3 /nobreak >nul
powershell -NoProfile -Command "try { Invoke-RestMethod http://127.0.0.1:1738/status | ConvertTo-Json -Compress } catch { 'Bridge belum merespon. Cek bridge\bridge.log' }"

echo.
echo Selesai. Sekarang tinggal load folder "extension" di chrome://extensions
echo (Developer mode ^> Load unpacked), kalau belum.
echo.
pause
