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
echo "[1/2] Installing dependencies (this may take a minute)..."
echo ""
npm install
echo ""
echo "[OK] Dependencies installed."

# ── Build the app ─────────────────────────────────────────────────────────────
echo ""
echo "[2/2] Building the app..."
echo ""
npm run build
echo ""
echo "[OK] App built."

echo ""
echo "============================================="
echo "  Setup complete!"
echo ""
echo "  Run ./launch.sh to start the app."
echo "  Configure your Discord bot in the dashboard."
echo "============================================="
echo ""
