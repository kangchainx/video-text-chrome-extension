#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: ./native-host/build-macos-pkg.sh <EXTENSION_ID> [VERSION]"
  exit 1
fi

EXTENSION_ID="$1"
VERSION="${2:-1.0.0}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST_DIR="${REPO_ROOT}/native-host"
PKG_DIR="${HOST_DIR}/macos-pkg"
BUILD_DIR="${PKG_DIR}/build"
PAYLOAD_DIR="${BUILD_DIR}/payload/Library/Application Support/VideoTextHost"
SCRIPTS_DIR="${BUILD_DIR}/scripts"

rm -rf "${BUILD_DIR}"
mkdir -p "${PAYLOAD_DIR}" "${SCRIPTS_DIR}"

PYTHON_BIN="${PYTHON_BIN:-}"
if [ -z "$PYTHON_BIN" ]; then
  # 优先使用项目虚拟环境的 Python
  if [ -x "${REPO_ROOT}/.venv/bin/python3" ]; then
    PYTHON_BIN="${REPO_ROOT}/.venv/bin/python3"
  elif [ -x "/opt/homebrew/opt/python@3.11/bin/python3.11" ]; then
    PYTHON_BIN="/opt/homebrew/opt/python@3.11/bin/python3.11"
  else
    PYTHON_BIN="python3"
  fi
fi

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "python3 not found. Install Python to build the package."
  exit 1
fi

if ! "$PYTHON_BIN" -m PyInstaller --version >/dev/null 2>&1; then
  echo "PyInstaller not found. Install it with: $PYTHON_BIN -m pip install pyinstaller"
  exit 1
fi

"${PYTHON_BIN}" -m PyInstaller \
  --clean \
  --onedir \
  --name video-text-transcriber \
  --distpath "${BUILD_DIR}/dist" \
  --workpath "${BUILD_DIR}/work" \
  --specpath "${BUILD_DIR}/spec" \
  --collect-all faster_whisper \
  --collect-all ctranslate2 \
  --collect-all opencc \
  --collect-all tokenizers \
  "${REPO_ROOT}/mini_transcriber.py"

cp -R "${BUILD_DIR}/dist/video-text-transcriber" "${PAYLOAD_DIR}/video-text-transcriber"
cp "${HOST_DIR}/host-macos.sh" "${PAYLOAD_DIR}/host-macos.sh"
cp "${HOST_DIR}/host.cjs" "${PAYLOAD_DIR}/host.cjs"
echo "${EXTENSION_ID}" > "${PAYLOAD_DIR}/extension-id.txt"

cp "${PKG_DIR}/scripts/postinstall" "${SCRIPTS_DIR}/postinstall"
chmod +x "${SCRIPTS_DIR}/postinstall" "${PAYLOAD_DIR}/host-macos.sh" "${PAYLOAD_DIR}/host.cjs" "${PAYLOAD_DIR}/video-text-transcriber/video-text-transcriber"

OUTPUT_PKG="${HOST_DIR}/VideoTextHost.pkg"

pkgbuild \
  --root "${BUILD_DIR}/payload" \
  --scripts "${SCRIPTS_DIR}" \
  --identifier "com.video_text.transcriber" \
  --version "${VERSION}" \
  --install-location "/" \
  "${OUTPUT_PKG}"

echo "Package created: ${OUTPUT_PKG}"
