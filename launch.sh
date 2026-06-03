#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# ── Sanity check ──────────────────────────────────────────────────────────────
if [ ! -f dist/server.mjs ]; then
    echo "[ERROR] App not installed yet."
    echo "  Run ./install.sh first."
    exit 1
fi

# ── Auto-update ───────────────────────────────────────────────────────────────
if [ -d ".git" ] && command -v git &>/dev/null; then
    BEFORE=$(git rev-parse HEAD 2>/dev/null || echo "")
    git pull --quiet 2>/dev/null || echo "[WARN] Update check failed — launching current version."
    AFTER=$(git rev-parse HEAD 2>/dev/null || echo "")
    if [ -n "$BEFORE" ] && [ "$BEFORE" != "$AFTER" ]; then
        echo "[UPDATE] New version detected — rebuilding..."
        echo ""
        npm install --silent
        npm run build
        echo ""
        echo "[OK] Update applied."
        echo ""
    fi
fi

# Add ~/.local/bin to PATH in case yt-dlp was downloaded there by install.sh
if [ -d "$HOME/.local/bin" ]; then
    export PATH="$HOME/.local/bin:$PATH"
fi

export NODE_ENV=production

echo ""
echo "============================================="
echo "  Discord OBS Overlay is starting..."
echo ""
echo "  Dashboard:          http://127.0.0.1:3000"
echo "  OBS Overlay source: http://127.0.0.1:3000/overlay"
echo ""
echo "  Press Ctrl+C to stop the app."
echo "============================================="
echo ""

# Open browser only once server is actually ready
(
    until curl -s http://127.0.0.1:3000/api/health >/dev/null 2>&1; do
        sleep 1
    done
    if command -v xdg-open &>/dev/null; then
        xdg-open "http://127.0.0.1:3000" &>/dev/null
    elif command -v open &>/dev/null; then
        open "http://127.0.0.1:3000"
    fi
) &

node dist/server.mjs || true

echo ""
echo "[ERROR] Server stopped unexpectedly. Check the output above for details."
read -r -p "Press Enter to close..."
