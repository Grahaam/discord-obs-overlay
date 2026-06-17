@echo off
cd /d "%~dp0"
setlocal EnableDelayedExpansion
title Discord OBS Overlay - Installer

echo.
echo =============================================
echo   Discord OBS Overlay - Setup
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

:: ── Install dependencies ────────────────────────────────────────────────────
echo.
echo [1/2] Installing Node dependencies...
echo.
if not exist "server" (
    :: Release package — prebuilt dist\, no build needed, skip devDependencies.
    call npm install --omit=dev
) else (
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

:: ── Build ───────────────────────────────────────────────────────────────────
echo.
if not exist "server" (
    echo [INFO] Source code not found (release package) — skipping build.
    if not exist "dist\server.mjs" (
        echo [ERROR] No source code and no prebuilt dist\server.mjs. This package is incomplete.
        pause
        exit /b 1
    )
    echo [OK] Using prebuilt dist\.
) else (
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

:: ── Optional Cobalt setup ───────────────────────────────────────────────────
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
                echo [SKIP] Podman machine not started — Cobalt won't run.
                set DOCKER_OK=0
            )
        )
    )
)

if !DOCKER_OK!==0 (
    net session >nul 2>&1
    if errorlevel 1 (
        echo [SKIP] Docker/Podman not found and not running as admin.
        echo  Right-click install.bat and choose "Run as administrator" to auto-install Docker.
        echo  Or install Docker manually: https://docs.docker.com/desktop/install/windows-install/
        goto :done
    )

    echo [!!] Docker/Podman not found — installing Docker Desktop...
    echo  This may take 5-15 minutes. A live timer will appear in the title bar.
    echo.

    where winget >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] winget not available. Install Docker manually:
        echo  https://docs.docker.com/desktop/install/windows-install/
        goto :done
    )

    set DONE_FLAG=%TEMP%\docker_install_done.tmp
    if exist "!DONE_FLAG!" del "!DONE_FLAG!"

    start "" cmd /c "winget install Docker.DockerDesktop --silent --accept-package-agreements --accept-source-agreements >nul 2>&1 & echo done > \"!DONE_FLAG!\""

    set /a SECS=0
    :wait_docker
    if exist "!DONE_FLAG!" goto :docker_done
    set /a SECS+=1
    set /a MINS=!SECS! / 60
    set /a RSECS=!SECS! %% 60
    title Discord OBS Overlay - Installing Docker... Time elapsed: !MINS!m !RSECS!s
    timeout /t 1 >nul
    goto :wait_docker

    :docker_done
    del "!DONE_FLAG!" >nul 2>&1
    title Discord OBS Overlay - Installer

    where docker >nul 2>&1
    if errorlevel 1 (
        echo.
        echo [OK] Docker Desktop installed.
        echo.
        echo  !! A system RESTART is required before Docker can run.
        echo.
        reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\RunOnce" /v "DiscordOBSInstall" /t REG_SZ /d "\"%~dpnx0\"" /f >nul 2>&1
        echo  [OK] Script registered to auto-resume after restart.
        echo.
        set /p REBOOT="  Restart now? (Y/N): "
        if /i "!REBOOT!"=="Y" (
            echo.
            echo  Restarting in 5 seconds... Press Ctrl+C to cancel.
            shutdown /r /t 5
        ) else (
            echo  Run install.bat again after restarting manually.
            pause
        )
        exit /b 0
    )

    set COMPOSE_CMD=docker compose
    echo [OK] Docker Desktop ready.
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
