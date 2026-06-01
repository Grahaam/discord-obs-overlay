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
    echo  2. Download and run the LTS installer
    echo  3. Re-run this script after installing
    echo.
    pause
    exit /b 1
)

for /f "tokens=1 delims=." %%i in ('node -v 2^>^&1') do (
    set RAW=%%i
    set MAJOR=!RAW:~1!
)
if !MAJOR! LSS 18 (
    echo [ERROR] Node.js !MAJOR! found — need 18 or higher.
    echo  Go to https://nodejs.org and download the LTS version.
    pause
    exit /b 1
)
echo [OK] Node.js !MAJOR! found.

:: ── Check / install yt-dlp ─────────────────────────────────────────────────
where yt-dlp >nul 2>&1
if errorlevel 1 (
    echo.
    echo [!!] yt-dlp not found — attempting to install...
    echo.

    set YTDLP_OK=0

    :: 1. winget (Windows 10 1709+)
    where winget >nul 2>&1
    if not errorlevel 1 (
        echo   Trying winget...
        winget install yt-dlp.yt-dlp --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
        where yt-dlp >nul 2>&1
        if not errorlevel 1 set YTDLP_OK=1
    )

    :: 2. pip (if Python installed)
    if !YTDLP_OK!==0 (
        where pip >nul 2>&1
        if not errorlevel 1 (
            echo   Trying pip...
            pip install yt-dlp --quiet >nul 2>&1
            where yt-dlp >nul 2>&1
            if not errorlevel 1 set YTDLP_OK=1
        )
    )

    :: 3. Download .exe into .\bin\ and add to PATH for this session
    if !YTDLP_OK!==0 (
        echo   Downloading yt-dlp.exe...
        if not exist bin mkdir bin
        curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" -o bin\yt-dlp.exe >nul 2>&1
        if exist bin\yt-dlp.exe (
            set "PATH=%CD%\bin;!PATH!"
            set YTDLP_OK=1
            echo   Installed to .\bin\yt-dlp.exe
        )
    )

    if !YTDLP_OK!==0 (
        echo.
        echo [WARN] Could not install yt-dlp automatically.
        echo  Video downloads will not work until you install it manually:
        echo  https://github.com/yt-dlp/yt-dlp#installation
        echo.
    ) else (
        echo [OK] yt-dlp installed.
    )
) else (
    echo [OK] yt-dlp found.
)

:: ── Install dependencies ───────────────────────────────────────────────────
echo.
if exist dist\server.mjs (
    echo [1/1] Installing Node dependencies...
    echo.
    call npm install --omit=dev
) else (
    echo [1/2] Installing Node dependencies...
    echo.
    call npm install
)
if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo.
echo [OK] Dependencies installed.

:: ── Build (skip if dist already present — e.g. release zip) ────────────────
if not exist dist\server.mjs (
    echo.
    echo [2/2] Building the app...
    echo.
    call npm run build
    if errorlevel 1 (
        echo.
        echo [ERROR] Build failed. Check the output above.
        pause
        exit /b 1
    )
    echo.
    echo [OK] App built.
)

echo.
echo =============================================
echo   Setup complete!
echo.
echo   Run launch.bat to start the app.
echo   Configure your Discord bot in the dashboard.
echo =============================================
echo.
pause
