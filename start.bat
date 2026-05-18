@echo off
title Celestial Dev Server
cd /d "%~dp0"
color 0A

:: Self-elevate to administrator (port 443 requires elevated rights on Windows)
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo  Requesting administrator privileges ^(required for port 443^)...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs -WorkingDirectory '%~dp0'"
  exit /b
)

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

:: --- Find cloudflared (PATH or known install locations) ----------------------
set "CLOUDFLARED="
where cloudflared >nul 2>&1
if %errorlevel% equ 0 (
  set "CLOUDFLARED=cloudflared"
) else if exist "C:\Program Files (x86)\cloudflared\cloudflared.exe" (
  set "CLOUDFLARED=C:\Program Files (x86)\cloudflared\cloudflared.exe"
) else if exist "C:\Program Files\cloudflared\cloudflared.exe" (
  set "CLOUDFLARED=C:\Program Files\cloudflared\cloudflared.exe"
)

:: --- Free ports if a previous instance is still running ---------------------
echo  Checking ports...
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr " :443 "') do (
  taskkill /PID %%P /F >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr " :8080 "') do (
  taskkill /PID %%P /F >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr " :9001 "') do (
  taskkill /PID %%P /F >nul 2>&1
)

:: --- Cloudflare Tunnel -------------------------------------------------------
if defined CLOUDFLARED (
  echo  Starting Cloudflare Tunnel ^(separate window^)...
  start "Cloudflare Tunnel" cmd /k "%CLOUDFLARED%" tunnel --url http://localhost:8080
  echo.
) else (
  echo  [info] cloudflared not found -- no public tunnel started.
  echo.
)

:: --- Launch ------------------------------------------------------------------
echo.
echo  ==========================================
echo     Celestial  --  local dev server
echo  ==========================================
echo.
echo  HTTPS   -^>  https://localhost
echo  Wisp    -^>  wss://localhost/wisp/
echo  PeerJS  -^>  ws://localhost:9001/peerjs
echo  CF      -^>  http://localhost:8080  ^(tunnel origin^)
echo.
echo  Tip: if Chrome shows a cert warning, click anywhere on the
echo  page and type:  thisisunsafe
echo.
echo  Press Ctrl+C to stop the server.
echo.

:restart
node serve.js
set EXIT_CODE=%errorlevel%
echo.
if %EXIT_CODE%==0 (
  echo  Server stopped cleanly.
  pause
  exit /b 0
)
echo  [!] Server exited ^(code %EXIT_CODE%^). Freeing ports and restarting in 3 s...
echo      Press Ctrl+C to cancel.
echo.
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr " :443 "') do (
  taskkill /PID %%P /F >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr " :8080 "') do (
  taskkill /PID %%P /F >nul 2>&1
)
for /f "tokens=5" %%P in ('netstat -ano 2^>nul ^| findstr " :9001 "') do (
  taskkill /PID %%P /F >nul 2>&1
)
timeout /t 3 /nobreak >nul
goto restart
