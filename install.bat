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

for /f "tokens=1 delims=v" %%i in ('node -v') do set NODE_VER=%%i
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
echo [1/3] Installing dependencies (this may take a minute)...
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
echo [2/3] Building the app...
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

:: ── Set up .env ───────────────────────────────────────────────────────────
echo.
echo [3/3] Setting up configuration...
echo.

if exist .env (
    echo [OK] .env file already exists — skipping.
    goto done
)

echo You need two things from Discord:
echo.
echo  1. Your BOT TOKEN — from https://discord.com/developers/applications
echo     (select your bot → Bot → Reset Token)
echo.
echo  2. The CHANNEL ID where alerts come from
echo     (right-click the channel in Discord → Copy Channel ID)
echo     (you may need to enable Developer Mode in Discord settings first)
echo.

set /p DISCORD_TOKEN="Paste your Bot Token here and press Enter: "
if "!DISCORD_TOKEN!"=="" (
    echo [WARN] No token entered. Edit .env manually before launching.
    set DISCORD_TOKEN=your_discord_bot_token_here
)

set /p CHANNEL_ID="Paste your Channel ID here and press Enter: "
if "!CHANNEL_ID!"=="" (
    echo [WARN] No channel ID entered. Edit .env manually before launching.
    set CHANNEL_ID=your_discord_channel_id_here
)

(
    echo NODE_ENV=production
    echo PORT=3000
    echo DISCORD_TOKEN=!DISCORD_TOKEN!
    echo CHANNEL_ID=!CHANNEL_ID!
    echo APP_URL=http://localhost:3000
) > .env

echo.
echo [OK] .env created.

:done
echo.
echo =============================================
echo   Setup complete!
echo.
echo   Run launch.bat to start the app.
echo =============================================
echo.
pause
