@echo off
cd /d "%~dp0"
setlocal EnableDelayedExpansion
title Discord OBS Overlay

:: -- Sanity check --
if not exist dist\server.mjs (
    echo [ERROR] App not installed yet.
    echo  Run install.bat first.
    pause
    exit /b 1
)

:: -- Auto-update --
if exist ".git" (
    where git >nul 2>&1
    if not errorlevel 1 (
        for /f %%i in ('git rev-parse HEAD 2^>nul') do set BEFORE=%%i
        git pull --quiet 2>nul
        if errorlevel 1 (
            echo [WARN] Update check failed - launching current version.
            echo.
            goto :launch
        )
        for /f %%i in ('git rev-parse HEAD 2^>nul') do set AFTER=%%i
        if not "!BEFORE!"=="!AFTER!" (
            echo [UPDATE] New version detected - rebuilding...
            echo.
            call npm install --silent
            if errorlevel 1 (
                echo [ERROR] npm install failed during update.
                pause
                exit /b 1
            )
            call npm run build
            if errorlevel 1 (
                echo [ERROR] Build failed during update.
                pause
                exit /b 1
            )
            echo.
            echo [OK] Update applied.
            echo.
        )
    )
)

:: Add .\bin to PATH in case yt-dlp was downloaded there by install.bat
if exist bin\yt-dlp.exe (
    set "PATH=%CD%\bin;%PATH%"
)

:launch
:: -- Launch --
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
