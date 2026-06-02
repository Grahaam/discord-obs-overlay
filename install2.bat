@echo off
setlocal EnableDelayedExpansion
title Discord OBS Overlay - Installer (with Cobalt)

echo.
echo =============================================
echo   Discord OBS Overlay - Setup + Cobalt
echo   (Run as Administrator for Docker install)
echo =============================================
echo.

:: ── Check admin ─────────────────────────────────────────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    echo [WARN] Not running as Administrator.
    echo  Docker installation will be skipped if Docker is not found.
    echo  Right-click install2.bat and choose "Run as administrator" to enable it.
    echo.
)

:: ── Run base installer first ─────────────────────────────────────────────────
echo [1/2] Running base installer...
echo.
call install.bat
if errorlevel 1 exit /b 1

:: ── Check / install Docker ───────────────────────────────────────────────────
echo.
echo [2/2] Setting up Cobalt media extractor...
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
    )
)

if !DOCKER_OK!==0 (
    net session >nul 2>&1
    if errorlevel 1 (
        echo [SKIP] Docker/Podman not found and not running as admin — skipping install.
        echo  Re-run as Administrator, or install Docker manually: https://docs.docker.com/desktop/install/windows-install/
        goto :cobalt_skip
    )

    echo [!!] Docker/Podman not found — attempting to install Docker Desktop...
    echo.

    where winget >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] winget not available. Install Docker manually:
        echo  https://docs.docker.com/desktop/install/windows-install/
        goto :cobalt_skip
    )

    winget install Docker.DockerDesktop --silent --accept-package-agreements --accept-source-agreements
    if errorlevel 1 (
        echo [ERROR] Docker install failed. Install manually:
        echo  https://docs.docker.com/desktop/install/windows-install/
        goto :cobalt_skip
    )

    set COMPOSE_CMD=docker compose
    echo.
    echo [OK] Docker Desktop installed.
    echo.
    echo  !! A system RESTART is required before Docker can run.
    echo  After restarting, run install2.bat again to start Cobalt.
    echo.
    pause
    exit /b 0
)

:: ── Start Cobalt container ───────────────────────────────────────────────────
if not exist docker-compose.cobalt.yml (
    echo [ERROR] docker-compose.cobalt.yml not found in current directory.
    goto :cobalt_skip
)

echo Starting Cobalt container with: !COMPOSE_CMD!
!COMPOSE_CMD! -f docker-compose.cobalt.yml up -d
if errorlevel 1 (
    echo [WARN] Could not start Cobalt. Make sure Docker/Podman is running.
    goto :cobalt_skip
)

echo [OK] Cobalt running at http://localhost:9000/
goto :cobalt_done

:cobalt_skip
echo [INFO] Cobalt not started — yt-dlp will handle media extraction.
echo  To enable Cobalt later, install Docker and run:
echo    docker compose -f docker-compose.cobalt.yml up -d

:cobalt_done
echo.
echo =============================================
echo   Setup complete!
echo.
echo   Run launch.bat to start the app.
echo   Set Cobalt URL in dashboard: http://localhost:9000/
echo =============================================
echo.
pause
