@echo off
title Bautomate Assessment Cloud
echo ==========================================
echo  Bautomate Assessment Cloud - Full Stack
echo ==========================================
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js belum terinstall.
  echo Install Node.js LTS dari https://nodejs.org/
  pause
  exit /b 1
)

if not exist node_modules (
  echo Menginstall dependency...
  call npm install
  if errorlevel 1 pause & exit /b 1
)

echo.
echo Website: http://localhost:5173
echo API:     http://localhost:3000/api/health
echo Tekan Ctrl+C untuk menghentikan aplikasi.
echo.
call npm run dev
pause

