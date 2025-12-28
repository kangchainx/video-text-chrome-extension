#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_PATH="${SCRIPT_DIR}/host-macos.sh"
MANIFEST_NAME="com.video_text.transcriber.json"
TARGET_DIR="${HOME}/Library/Application Support/Google/Chrome/NativeMessagingHosts"
TARGET_PATH="${TARGET_DIR}/${MANIFEST_NAME}"

EXT_ID="${1:-}"
if [ -z "${EXT_ID}" ]; then
  echo "Enter extension ID (from chrome://extensions):"
  read -r EXT_ID
fi

if [ -z "${EXT_ID}" ]; then
  echo "Extension ID is required."
  exit 1
fi

NODE_BIN="$(command -v node || true)"
PYTHON_BIN="$(command -v python3 || true)"

if [ -z "${NODE_BIN}" ]; then
  echo "node not found. Please install Node.js first." >&2
  exit 127
fi
if [ -z "${PYTHON_BIN}" ]; then
  echo "python3 not found. Please install Python 3 first." >&2
  exit 127
fi

chmod +x "${SCRIPT_DIR}/host.cjs"
chmod +x "${HOST_PATH}"
mkdir -p "${TARGET_DIR}"

cat > "${TARGET_PATH}" <<EOF
{
  "name": "com.video_text.transcriber",
  "description": "Video Text Assistant Native Host",
  "path": "${HOST_PATH}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://${EXT_ID}/"
  ]
}
EOF

echo "Native host manifest installed:"
echo "${TARGET_PATH}"
echo "If you change extension ID, rerun this script."
echo ""
echo "Detected binaries:"
echo "NODE_BIN=${NODE_BIN}"
echo "PYTHON_BIN=${PYTHON_BIN}"
echo ""
echo "If Chrome cannot find node/python, set them explicitly and rerun:"
echo "NODE_BIN=/abs/path/to/node PYTHON_BIN=/abs/path/to/python3 ./native-host/install-macos.sh ${EXT_ID}"
