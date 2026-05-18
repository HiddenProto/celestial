@echo off
title Celestial Dev Server
cd /d "%~dp0"
color 0A

:: --- Node.js check -----------------------------------------------------------
where node >nul 2>&1
if %errorlevel% neq 0 (
  echo.
  echo  [ERROR] Node.js not found in PATH.
  echo  Install from https://nodejs.org  ^(LTS recommended^)
  echo.
  pause
  exit /b 1
)

:: --- Dependency check --------------------------------------------------------
if not exist "node_modules\ws" (
  echo.
  echo  [setup] ws not found -- running npm install...
  echo.
  call npm install --include=dev
  if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] npm install failed. Check your internet connection.
    echo.
    pause
    exit /b 1
  )
  echo.
)

:: --- Launch ------------------------------------------------------------------
echo.
echo  ==========================================
echo     Celestial  --  local dev server
echo  ==========================================
echo.
echo  HTTPS   -^>  https://localhost:8443
echo  Wisp    -^>  wss://localhost:8443/wisp/
echo  PeerJS  -^>  ws://localhost:9001/peerjs
echo.
echo  Tip: if Chrome shows a cert warning, click anywhere on the
echo  page and type:  thisisunsafe
echo.
echo  Press Ctrl+C to stop the server.
echo.

:restart
node serve.js
echo.
echo  [!] Server exited ^(code %errorlevel%^). Restarting in 3 s...
echo      Press Ctrl+C to cancel.
echo.
timeout /t 3 /nobreak >nul
goto restart
