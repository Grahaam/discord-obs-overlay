@echo off
setlocal EnableDelayedExpansion
title Discord OBS Overlay - Installer

echo.
echo =============================================
echo   Discord OBS Overlay - First-time Setup
echo =============================================
echo.

:: ── Check Node.js ──────────────────────────────────────────────────────────
where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is not installed.
    echo.
    echo  1. Go to https://nodejs.org
    echo  2. Download the LTS version
    echo  3. Install it, then re-run this script
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%i in ('node -v 2^>^&1') do (
    set RAW=%%i
    set MAJOR=!RAW:~1!
)
if !MAJOR! LSS 18 (
    echo [ERROR] Node.js version !MAJOR! found. Need version 18 or higher.
    echo.
    echo  Go to https://nodejs.org and download the LTS version.
    echo.
    pause
    exit /b 1
)
echo [OK] Node.js found.

:: ── Install dependencies ───────────────────────────────────────────────────
echo.
echo [1/2] Installing dependencies (this may take a minute)...
echo.
call npm install
if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check the output above for details.
    pause
    exit /b 1
)
echo.
echo [OK] Dependencies installed.

:: ── Build the app ─────────────────────────────────────────────────────────
echo.
echo [2/2] Building the app...
echo.
call npm run build
if errorlevel 1 (
    echo.
    echo [ERROR] Build failed. Check the output above for details.
    pause
    exit /b 1
)
echo.
echo [OK] App built.

echo.
echo =============================================
echo   Setup complete!
echo.
echo   Run launch.bat to start the app.
echo   Configure your Discord bot in the dashboard.
echo =============================================
echo.
pause
