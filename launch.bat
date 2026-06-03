@echo off
cd /d "%~dp0"
setlocal EnableDelayedExpansion
title Discord OBS Overlay

:: ── Sanity check ───────────────────────────────────────────────────────────
if not exist dist\server.mjs (
    echo [ERROR] App not installed yet.
    echo  Run install.bat first.
    pause
    exit /b 1
)

:: Add .\bin to PATH in case yt-dlp was downloaded there by install.bat
if exist bin\yt-dlp.exe (
    set "PATH=%CD%\bin;%PATH%"
)

:: ── Launch ─────────────────────────────────────────────────────────────────
set NODE_ENV=production

echo.
echo =============================================
echo   Discord OBS Overlay is starting...
echo.
echo   Dashboard:          http://127.0.0.1:3000
echo   OBS Overlay source: http://127.0.0.1:3000/overlay
echo.
echo   Close this window to stop the app.
echo =============================================
echo.

:: Open browser only once server is actually ready
start "" powershell -WindowStyle Hidden -Command "do { Start-Sleep 1 } until (try { (Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/health' -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200 } catch { $false }); Start-Process 'http://127.0.0.1:3000'"

node dist\server.mjs

echo.
echo [ERROR] Server stopped unexpectedly. Check the output above for details.
pause
