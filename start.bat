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

:: --- Public tunnel (persistent subdomain via localtunnel) --------------------
echo  Starting public tunnel -^> https://cst-celestial.loca.lt
start "Public Tunnel  --  https://cst-celestial.loca.lt" cmd /k "npx lt --port 8080 --subdomain cst-celestial"
echo.

:: --- Launch ------------------------------------------------------------------
echo.
echo  ==========================================
echo     Celestial  --  local dev server
echo  ==========================================
echo.
echo  Local   -^>  https://localhost
echo  Public  -^>  https://cst-celestial.loca.lt
echo  Wisp    -^>  wss://cst-celestial.loca.lt/wisp/
echo  PeerJS  -^>  ws://localhost:9001/peerjs
echo.
echo  NOTE: first-time visitors may see a one-click confirmation page.
echo  They just click once and it opens normally after that.
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
