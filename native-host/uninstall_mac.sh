#!/usr/bin/env bash
set -euo pipefail

HOST_DIR="${HOME}/Library/Application Support/VideoTextHost"
LEGACY_HOST_DIR="${HOME}/video-text-host"
MANIFEST_PATH="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json"

echo "=== VideoText Native Host Uninstaller (macOS) ==="
echo ""

if [ -d "${HOST_DIR}" ]; then
  echo "Found host directory: ${HOST_DIR}"
  echo "Removing host directory..."
  rm -rf "${HOST_DIR}"
  echo "✅ Removed host directory."
else
  echo "Host directory not found."
fi

if [ -d "${LEGACY_HOST_DIR}" ]; then
  echo "Removing legacy host directory: ${LEGACY_HOST_DIR}"
  rm -rf "${LEGACY_HOST_DIR}"
  echo "✅ Removed legacy host directory."
fi

if [ -f "${MANIFEST_PATH}" ]; then
  echo "Found native messaging manifest: ${MANIFEST_PATH}"
  echo "Removing manifest..."
  rm -f "${MANIFEST_PATH}"
  echo "✅ Removed manifest."
else
  echo "Native messaging manifest not found."
fi

echo ""
echo "=========================================="
echo "   Uninstall Complete!   "
echo "=========================================="
