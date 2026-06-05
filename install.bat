@echo off
cd /d "%~dp0"
setlocal EnableDelayedExpansion
title Discord OBS Overlay - Installer

echo.
echo =============================================
echo   Discord OBS Overlay - Setup
echo =============================================
echo.

:: -- Check Node.js --
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
    echo [ERROR] Node.js !MAJOR! found - need 18 or higher.
    echo  Go to https://nodejs.org and download the LTS version.
    pause
    exit /b 1
)
echo [OK] Node.js !MAJOR! found.

:: -- Check / install yt-dlp --
where yt-dlp >nul 2>&1
if errorlevel 1 (
    echo.
    echo [!!] yt-dlp not found - attempting to install...
    echo.

    set YTDLP_OK=0

    where winget >nul 2>&1
    if not errorlevel 1 (
        echo   Trying winget...
        winget install yt-dlp.yt-dlp --silent --accept-package-agreements --accept-source-agreements >nul 2>&1
        where yt-dlp >nul 2>&1
        if not errorlevel 1 set YTDLP_OK=1
    )

    if !YTDLP_OK!==0 (
        where pip >nul 2>&1
        if not errorlevel 1 (
            echo   Trying pip...
            pip install yt-dlp --quiet >nul 2>&1
            where yt-dlp >nul 2>&1
            if not errorlevel 1 set YTDLP_OK=1
        )
    )

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

:: -- Install dependencies --
echo.
echo [1/2] Installing Node dependencies...
echo.
call npm install
if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed.
    pause
    exit /b 1
)
echo.
echo [OK] Dependencies installed.

:: -- Build --
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

:: -- Optional Cobalt setup --
echo.
echo =============================================
echo   Cobalt is an optional media extractor
echo   that improves video/audio downloads.
echo   Requires Docker or Podman.
echo =============================================
echo.
set /p SETUP_COBALT="Set up Cobalt now? (Y/N): "
if /i "!SETUP_COBALT!" NEQ "Y" goto :done

echo.

set DOCKER_OK=0
set COMPOSE_CMD=

where docker >nul 2>&1
if not errorlevel 1 (
    set DOCKER_OK=1
    set COMPOSE_CMD=docker compose
    echo [OK] Docker found.
)

if !DOCKER_OK!==0 (
    where podman >nul 2>&1
    if not errorlevel 1 (
        set DOCKER_OK=1
        set COMPOSE_CMD=podman compose
        echo [OK] Podman found.
        podman info >nul 2>&1
        if errorlevel 1 (
            echo [!!] Podman machine not running.
            set /p START_MACHINE="  Start Podman machine now? (Y/N): "
            if /i "!START_MACHINE!"=="Y" (
                podman machine start
                podman info >nul 2>&1
                if errorlevel 1 (
                    echo [ERROR] Could not start Podman machine. Run: podman machine start
                    set DOCKER_OK=0
                )
            ) else (
                echo [SKIP] Podman machine not started - Cobalt won't run.
                set DOCKER_OK=0
            )
        )
    )
)

if !DOCKER_OK!==0 (
    echo [!!] Docker/Podman not found.
    echo.
    echo  Docker Desktop is required to run Cobalt.
    echo.
    echo  1. Install Docker Desktop (opens installer GUI)
    echo  2. Open download page in browser
    echo  3. Skip Cobalt setup for now
    echo.
    set /p DOCKER_CHOICE="  Choice (1/2/3): "

    if "!DOCKER_CHOICE!"=="1" (
        echo.
        where winget >nul 2>&1
        if not errorlevel 1 (
            echo  Launching Docker Desktop installer...
            start "" winget install Docker.DockerDesktop --accept-package-agreements --accept-source-agreements
        ) else (
            echo  winget not available - opening download page instead...
            start https://docs.docker.com/desktop/install/windows-install/
        )
        echo.
        echo  Once Docker Desktop is installed and running, re-run install.bat to finish Cobalt setup.
        echo.
        pause
        goto :done
    )
    if "!DOCKER_CHOICE!"=="2" (
        echo.
        start https://docs.docker.com/desktop/install/windows-install/
        echo  Download page opened in browser.
        echo  Re-run install.bat after installing Docker Desktop.
        echo.
        pause
        goto :done
    )
    goto :done
)

if not exist docker-compose.cobalt.yml (
    echo [ERROR] docker-compose.cobalt.yml not found.
    goto :done
)

echo Starting Cobalt container with: !COMPOSE_CMD!
!COMPOSE_CMD! -f docker-compose.cobalt.yml up -d
if errorlevel 1 (
    echo [WARN] Could not start Cobalt. Make sure Docker/Podman is running.
    goto :done
)
echo [OK] Cobalt running at http://localhost:9000/
echo  Set this URL in the dashboard under Cobalt API URL.

:done
echo.
echo =============================================
echo   Setup complete!
echo.
echo   Run launch.bat to start the app.
echo   Configure your Discord bot in the dashboard.
echo =============================================
echo.
pause
