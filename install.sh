#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "============================================="
echo "  Discord OBS Overlay - Setup"
echo "============================================="
echo ""

# ── Pull latest changes from GitHub ──────────────────────────────────────────
if [ -d ".git" ]; then
    if command -v git &>/dev/null; then
        echo "Checking for updates..."
        git pull || echo "[WARN] git pull failed — continuing with current version."
        echo ""
    else
        echo "[WARN] Git not found — skipping update check."
        echo "  Install Git to enable auto-updates."
        echo ""
    fi
else
    echo "[WARN] No .git folder found — auto-update disabled."
    echo "  For auto-updates, clone the repo instead of downloading the ZIP:"
    echo "    git clone https://github.com/Grahaam/discord-obs-overlay.git"
    echo ""
fi

# ── Check Node.js ─────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo ""
    echo "  Install it from https://nodejs.org (LTS version)"
    echo "    macOS:   brew install node"
    echo "    Ubuntu:  sudo apt install nodejs npm"
    echo ""
    echo "  Re-run this script after installing Node."
    exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "[ERROR] Node.js $NODE_MAJOR found — need 18 or higher."
    echo "  Download the LTS version from https://nodejs.org"
    exit 1
fi
echo "[OK] Node.js $NODE_MAJOR found."

# ── Check / install yt-dlp ────────────────────────────────────────────────────
if command -v yt-dlp &>/dev/null; then
    echo "[OK] yt-dlp found."
else
    echo ""
    echo "[!!] yt-dlp not found — attempting to install..."
    echo ""

    YTDLP_INSTALLED=false

    if command -v pip3 &>/dev/null; then
        echo "  Trying pip3..."
        if pip3 install -U yt-dlp --quiet; then YTDLP_INSTALLED=true; fi
    fi

    if [ "$YTDLP_INSTALLED" = false ] && command -v brew &>/dev/null; then
        echo "  Trying Homebrew..."
        if brew install yt-dlp --quiet; then YTDLP_INSTALLED=true; fi
    fi

    if [ "$YTDLP_INSTALLED" = false ] && command -v apt-get &>/dev/null; then
        echo "  Trying apt-get (requires sudo)..."
        if sudo apt-get install -y yt-dlp -qq; then YTDLP_INSTALLED=true; fi
    fi

    if [ "$YTDLP_INSTALLED" = false ]; then
        echo "  Downloading yt-dlp binary..."
        YTDLP_BIN_DIR="$HOME/.local/bin"
        mkdir -p "$YTDLP_BIN_DIR"
        if curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" \
               -o "$YTDLP_BIN_DIR/yt-dlp"; then
            chmod +x "$YTDLP_BIN_DIR/yt-dlp"
            export PATH="$YTDLP_BIN_DIR:$PATH"
            YTDLP_INSTALLED=true
            echo "  Installed to $YTDLP_BIN_DIR/yt-dlp"
            echo "  Add to shell profile: export PATH=\"\$HOME/.local/bin:\$PATH\""
        fi
    fi

    if [ "$YTDLP_INSTALLED" = false ]; then
        echo ""
        echo "[WARN] Could not install yt-dlp automatically."
        echo "  https://github.com/yt-dlp/yt-dlp#installation"
        echo ""
    else
        echo "[OK] yt-dlp installed."
    fi
fi

# ── Install dependencies ───────────────────────────────────────────────────────
echo ""
echo "[1/2] Installing Node dependencies..."
echo ""
npm install --silent
echo "[OK] Dependencies installed."

# ── Build ──────────────────────────────────────────────────────────────────────
echo ""
echo "[2/2] Building the app..."
echo ""
npm run build
echo ""
echo "[OK] App built."

# ── Optional Cobalt setup ──────────────────────────────────────────────────────
echo ""
echo "============================================="
echo "  Cobalt is an optional media extractor"
echo "  that improves video/audio downloads."
echo "  Requires Docker or Podman."
echo "============================================="
echo ""
read -r -p "Set up Cobalt now? (Y/N): " SETUP_COBALT
if [[ ! "$SETUP_COBALT" =~ ^[Yy]$ ]]; then
    echo ""
    echo "============================================="
    echo "  Setup complete!"
    echo ""
    echo "  Run ./launch.sh to start the app."
    echo "  Configure your Discord bot in the dashboard."
    echo "============================================="
    echo ""
    exit 0
fi

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

if [ "$DOCKER_OK" -eq 0 ]; then
    if [ "$(uname)" = "Darwin" ]; then
        echo "[!!] Docker not found. Attempting install via Homebrew..."
        if command -v brew &>/dev/null; then
            brew install --cask docker
            echo "[OK] Docker Desktop installed. Launch Docker.app then re-run this script."
            open -a Docker 2>/dev/null || true
            echo ""
            echo "  Wait for Docker to start (whale icon in menu bar), then run:"
            echo "    bash install.sh"
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
            echo "  sudo bash install.sh"
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
    echo "  To enable Cobalt later: docker compose -f docker-compose.cobalt.yml up -d"
else
    if [ ! -f docker-compose.cobalt.yml ]; then
        echo "[ERROR] docker-compose.cobalt.yml not found."
    else
        echo "Starting Cobalt container with: $COMPOSE_CMD"
        $COMPOSE_CMD -f docker-compose.cobalt.yml up -d
        COBALT_PORT=$($COMPOSE_CMD port cobalt 9000 2>/dev/null | cut -d ':' -f 2 || echo "9000")
        echo "[OK] Cobalt running at http://localhost:$COBALT_PORT/"
        echo "  Set this URL in the dashboard under Cobalt API URL."
    fi
fi

echo ""
echo "============================================="
echo "  Setup complete!"
echo ""
echo "  Run ./launch.sh to start the app."
echo "  Configure your Discord bot in the dashboard."
echo "============================================="
echo ""
