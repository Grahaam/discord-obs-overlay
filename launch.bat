@echo off
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
echo.
echo =============================================
echo   Discord OBS Overlay is starting...
echo.
echo   Dashboard:          http://localhost:3000
echo   OBS Overlay source: http://localhost:3000/overlay
echo.
echo   Close this window to stop the app.
echo =============================================
echo.

:: Open browser after a short delay
start "" cmd /c "timeout /t 2 >nul && start http://localhost:3000"

node dist/server.mjs
