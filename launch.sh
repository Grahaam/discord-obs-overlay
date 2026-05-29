#!/usr/bin/env bash
set -euo pipefail

# ── Sanity checks ─────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
    echo "[ERROR] .env file not found."
    echo ""
    echo "  Run ./install.sh first to set up the app."
    echo ""
    exit 1
fi

if [ ! -f dist/server.mjs ]; then
    echo "[ERROR] App not built yet."
    echo ""
    echo "  Run ./install.sh first to build the app."
    echo ""
    exit 1
fi

# ── Open browser after a short delay ──────────────────────────────────────────
(
    sleep 2
    if command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:3000" &>/dev/null
    elif command -v open &>/dev/null; then
        open "http://localhost:3000"
    fi
) &

# ── Launch ─────────────────────────────────────────────────────────────────────
echo ""
echo "============================================="
echo "  Discord OBS Overlay is starting..."
echo ""
echo "  Dashboard:          http://localhost:3000"
echo "  OBS Overlay source: http://localhost:3000/overlay"
echo ""
echo "  Press Ctrl+C to stop the app."
echo "============================================="
echo ""

npm start
