#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "============================================="
echo "  Discord OBS Overlay - Setup + Cobalt"
echo "============================================="
echo ""

# ── Run base installer ────────────────────────────────────────────────────────
echo "[1/2] Running base installer..."
echo ""
bash "$(dirname "$0")/setup-yt-dlp.sh" || true
npm install
if [ ! -f dist/server.mjs ]; then
    npm run build
fi

echo ""
echo "[2/2] Setting up Cobalt media extractor..."
echo ""

DOCKER_OK=0
COMPOSE_CMD=""

if command -v docker &>/dev/null; then
    DOCKER_OK=1
    COMPOSE_CMD="docker compose"
    echo "[OK] Docker found."
elif command -v podman &>/dev/null; then
    DOCKER_OK=1
    COMPOSE_CMD="podman compose"
    echo "[OK] Podman found."
fi

# ── Install Docker if missing ─────────────────────────────────────────────────
if [ "$DOCKER_OK" -eq 0 ]; then
    if [ "$(uname)" = "Darwin" ]; then
        echo "[!!] Docker not found. Attempting install via Homebrew..."
        if command -v brew &>/dev/null; then
            brew install --cask docker
            COMPOSE_CMD="docker compose"
            echo "[OK] Docker Desktop installed. Launch Docker.app then re-run this script."
            open -a Docker 2>/dev/null || true
            echo ""
            echo "  Wait for Docker to start (whale icon in menu bar), then run:"
            echo "    bash install2.sh"
            echo ""
            exit 0
        else
            echo "[SKIP] Homebrew not found. Install Docker manually:"
            echo "  https://docs.docker.com/desktop/install/mac-install/"
            DOCKER_OK=0
        fi
    elif [ "$(uname)" = "Linux" ]; then
        if [ "$EUID" -ne 0 ]; then
            echo "[SKIP] Not root. Run with sudo to auto-install Docker:"
            echo "  sudo bash install2.sh"
            DOCKER_OK=0
        else
            echo "[!!] Installing Docker Engine..."
            curl -fsSL https://get.docker.com | sh
            systemctl enable --now docker 2>/dev/null || true
            if command -v docker &>/dev/null; then
                DOCKER_OK=1
                COMPOSE_CMD="docker compose"
            fi
        fi
    fi
fi

if [ "$DOCKER_OK" -eq 0 ]; then
    echo "[INFO] Cobalt not started — yt-dlp handles media extraction."
    echo "  To enable Cobalt later: install Docker, then run:"
    echo "    docker compose -f docker-compose.cobalt.yml up -d"
    echo ""
else
    # ── Start Cobalt container ────────────────────────────────────────────────
    COMPOSE_FILE="$(dirname "$0")/docker-compose.cobalt.yml"
    if [ ! -f "$COMPOSE_FILE" ]; then
        echo "[ERROR] docker-compose.cobalt.yml not found."
    else
        echo "Starting Cobalt container with: $COMPOSE_CMD"
        $COMPOSE_CMD -f "$COMPOSE_FILE" up -d

        # Détecter le port hôte réel de Cobalt
        COBALT_HOST_PORT=$($COMPOSE_CMD port cobalt 9000 | cut -d ':' -f 2 || echo "9000")

        echo "[OK] Cobalt running at http://localhost:$COBALT_HOST_PORT/"
    fi
fi

echo ""
echo "============================================="
echo "  Setup complete!"
echo ""
echo "  Run: npm start"
echo "  Set Cobalt URL in dashboard: http://localhost:$COBALT_HOST_PORT/"
echo "============================================="
echo ""
