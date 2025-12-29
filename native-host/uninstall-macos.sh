#!/usr/bin/env bash
set -euo pipefail

HOST_DIR="${HOME}/Library/Application Support/VideoTextHost"
LEGACY_HOST_DIR="${HOME}/video-text-host"
MANIFEST_PATH="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.video_text.transcriber.json"

echo "Removing host directory: ${HOST_DIR}"
rm -rf "${HOST_DIR}"

if [ -d "${LEGACY_HOST_DIR}" ]; then
  echo "Removing legacy host directory: ${LEGACY_HOST_DIR}"
  rm -rf "${LEGACY_HOST_DIR}"
fi

echo "Removing native messaging manifest: ${MANIFEST_PATH}"
rm -f "${MANIFEST_PATH}"

echo "Uninstall complete."
