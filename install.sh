#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "============================================="
echo "  Discord OBS Overlay - First-time Setup"
echo "============================================="
echo ""

# ── Check Node.js ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
    echo "[ERROR] Node.js is not installed."
    echo ""
    echo "  Install it with one of these:"
    echo "    macOS:  brew install node   (or download from https://nodejs.org)"
    echo "    Ubuntu: sudo apt install nodejs npm"
    echo "    Other:  https://nodejs.org → LTS version"
    echo ""
    exit 1
fi

NODE_MAJOR=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "[ERROR] Node.js $NODE_MAJOR found. Need version 18 or higher."
    echo ""
    echo "  Download the LTS version from https://nodejs.org"
    echo ""
    exit 1
fi
echo "[OK] Node.js found."

# ── Install dependencies ──────────────────────────────────────────────────────
echo ""
echo "[1/3] Installing dependencies (this may take a minute)..."
echo ""
npm install
echo ""
echo "[OK] Dependencies installed."

# ── Build the app ─────────────────────────────────────────────────────────────
echo ""
echo "[2/3] Building the app..."
echo ""
npm run build
echo ""
echo "[OK] App built."

# ── Set up .env ───────────────────────────────────────────────────────────────
echo ""
echo "[3/3] Setting up configuration..."
echo ""

if [ -f .env ]; then
    echo "[OK] .env file already exists — skipping."
else
    echo "You need two things from Discord:"
    echo ""
    echo "  1. Your BOT TOKEN — from https://discord.com/developers/applications"
    echo "     (select your bot → Bot → Reset Token)"
    echo ""
    echo "  2. The CHANNEL ID where alerts come from"
    echo "     (right-click the channel in Discord → Copy Channel ID)"
    echo "     (enable Developer Mode in Discord settings first if needed)"
    echo ""

    read -rp "Paste your Bot Token here and press Enter: " DISCORD_TOKEN
    if [ -z "$DISCORD_TOKEN" ]; then
        echo "[WARN] No token entered. Edit .env manually before launching."
        DISCORD_TOKEN="your_discord_bot_token_here"
    fi

    read -rp "Paste your Channel ID here and press Enter: " CHANNEL_ID
    if [ -z "$CHANNEL_ID" ]; then
        echo "[WARN] No channel ID entered. Edit .env manually before launching."
        CHANNEL_ID="your_discord_channel_id_here"
    fi

    cat > .env <<EOF
NODE_ENV=production
PORT=3000
DISCORD_TOKEN=${DISCORD_TOKEN}
CHANNEL_ID=${CHANNEL_ID}
APP_URL=http://localhost:3000
EOF

    echo ""
    echo "[OK] .env created."
fi

echo ""
echo "============================================="
echo "  Setup complete!"
echo ""
echo "  Run ./launch.sh to start the app."
echo "============================================="
echo ""
