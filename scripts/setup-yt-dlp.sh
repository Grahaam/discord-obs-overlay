#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "[Setup] Running yt-dlp setup script..."

PYTHON_VERSION="3.10"
PYTHON_EXEC="python${PYTHON_VERSION}"

# Check if Python 3.10+ is available
if ! command -v ${PYTHON_EXEC} &> /dev/null
then
    echo "Error: Python ${PYTHON_VERSION} or higher is required but not found."
    echo "Please install Python ${PYTHON_VERSION}+ and try again."
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "[Setup] Creating Python virtual environment..."
    ${PYTHON_EXEC} -m venv .venv
    echo "[Setup] Virtual environment created."
fi

# Activate virtual environment and install yt-dlp if not already installed
# Using a subshell to activate and run commands, so it doesn't affect the main shell
( 
    source .venv/bin/activate
    if ! command -v yt-dlp &> /dev/null; then
        echo "[Setup] Installing yt-dlp into virtual environment..."
        pip install yt-dlp
        echo "[Setup] yt-dlp installed."
    else
        echo "[Setup] yt-dlp already installed in virtual environment. Skipping installation."
    fi
)

echo "[Setup] yt-dlp setup complete."
