#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "[Setup] Running yt-dlp setup script..."

# Find a suitable python executable (requires Python 3.10+)
PYTHON_EXEC=""
# We search from generic to specific to find any compatible version >= 3.10
for cmd in python3 python3.12 python3.11 python3.10; do
    if command -v $cmd &> /dev/null; then
        # Check if the found version is actually >= 3.10
        VERSION_OK=$($cmd -c 'import sys; print(1 if sys.version_info >= (3, 10) else 0)')
        if [ "$VERSION_OK" = "1" ]; then
            PYTHON_EXEC=$cmd
            echo "[Setup] Found compatible Python executable: $PYTHON_EXEC"
            break
        fi
    fi
done

# Check if a Python executable was found
if [ -z "$PYTHON_EXEC" ]; then
    echo "Error: Python 3.10+ is required but not found."
    echo "Please install a compatible Python version (3.10 or newer) and try again."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "[Setup] Creating Python virtual environment..."
    ${PYTHON_EXEC} -m venv .venv
    echo "[Setup] Virtual environment created."
fi

# Activate virtual environment and install/update yt-dlp
# Using a subshell to activate and run commands, so it doesn't affect the main shell
( 
    source .venv/bin/activate
    echo "[Setup] Upgrading pip and installing/updating yt-dlp..."
    pip install --upgrade pip
    pip install --upgrade yt-dlp
    echo "[Setup] yt-dlp is up to date."
)

echo "[Setup] yt-dlp setup complete."
