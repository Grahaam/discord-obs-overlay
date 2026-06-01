#!/usr/bin/env bash
set -euo pipefail

# ── Sanity check ──────────────────────────────────────────────────────────────
if [ ! -f dist/server.mjs ]; then
    echo "[ERROR] App not installed yet."
    echo "  Run ./install.sh first."
    exit 1
fi

# Add ./bin to PATH in case yt-dlp was downloaded there by install.sh
if [ -d "$HOME/.local/bin" ]; then
    export PATH="$HOME/.local/bin:$PATH"
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

node dist/server.mjs
