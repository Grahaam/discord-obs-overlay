#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

echo ""
echo "============================================="
echo "  Discord OBS Overlay - First-time Setup"
echo "============================================="
echo ""

# ── Check Node.js ────────────────────────────────────────────────────────────
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

# ── Check / install yt-dlp ───────────────────────────────────────────────────
if command -v yt-dlp &>/dev/null; then
    echo "[OK] yt-dlp found."
else
    echo ""
    echo "[!!] yt-dlp not found — attempting to install..."
    echo ""

    YTDLP_INSTALLED=false

    # 1. pip3
    if command -v pip3 &>/dev/null; then
        echo "  Trying pip3..."
        if pip3 install -U yt-dlp --quiet; then
            YTDLP_INSTALLED=true
        fi
    fi

    # 2. brew (macOS)
    if [ "$YTDLP_INSTALLED" = false ] && command -v brew &>/dev/null; then
        echo "  Trying Homebrew..."
        if brew install yt-dlp --quiet; then
            YTDLP_INSTALLED=true
        fi
    fi

    # 3. apt (Debian/Ubuntu)
    if [ "$YTDLP_INSTALLED" = false ] && command -v apt-get &>/dev/null; then
        echo "  Trying apt-get (requires sudo)..."
        if sudo apt-get install -y yt-dlp -qq; then
            YTDLP_INSTALLED=true
        fi
    fi

    # 4. direct binary download → ~/.local/bin
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
            echo "  Add this to your shell profile: export PATH=\"\$HOME/.local/bin:\$PATH\""
        fi
    fi

    if [ "$YTDLP_INSTALLED" = false ]; then
        echo ""
        echo "[WARN] Could not install yt-dlp automatically."
        echo "  Video downloads will not work until you install it manually:"
        echo "  https://github.com/yt-dlp/yt-dlp#installation"
        echo ""
    else
        echo "[OK] yt-dlp installed."
    fi
fi

# ── Install dependencies ──────────────────────────────────────────────────────
STEP=1
TOTAL=2
if [ ! -f dist/server.mjs ]; then
    TOTAL=3
fi

echo ""
echo "[$STEP/$TOTAL] Installing Node dependencies..."
echo ""
if [ -f dist/server.mjs ]; then
    npm install --omit=dev --silent
else
    npm install --silent
fi
STEP=$((STEP + 1))
echo "[OK] Dependencies installed."

# ── Build (skip if dist already present — e.g. release zip) ──────────────────
if [ ! -f dist/server.mjs ]; then
    echo ""
    echo "[$STEP/$TOTAL] Building the app..."
    echo ""
    npm run build
    echo ""
    echo "[OK] App built."
fi

echo ""
echo "============================================="
echo "  Setup complete!"
echo ""
echo "  Run ./launch.sh to start the app."
echo "  Configure your Discord bot in the dashboard."
echo "============================================="
echo ""
