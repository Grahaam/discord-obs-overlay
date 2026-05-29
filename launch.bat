@echo off
setlocal EnableDelayedExpansion
title Discord OBS Overlay

:: ── Sanity checks ─────────────────────────────────────────────────────────
if not exist .env (
    echo [ERROR] .env file not found.
    echo.
    echo  Run install.bat first to set up the app.
    echo.
    pause
    exit /b 1
)

if not exist dist\server.mjs (
    echo [ERROR] App not built yet.
    echo.
    echo  Run install.bat first to build the app.
    echo.
    pause
    exit /b 1
)

:: ── Launch ─────────────────────────────────────────────────────────────────
echo.
echo =============================================
echo   Discord OBS Overlay is starting...
echo.
echo   Dashboard: http://localhost:3000
echo   OBS Overlay source: http://localhost:3000/overlay
echo.
echo   Close this window to stop the app.
echo =============================================
echo.

:: Open browser after a short delay
start "" cmd /c "timeout /t 2 >nul && start http://localhost:3000"

call npm start
