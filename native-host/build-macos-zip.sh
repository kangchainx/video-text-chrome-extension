#!/bin/bash
# build-macos-zip.sh
# Builds the macOS executable using PyInstaller and packages it into a ZIP file.

set -e

EXTENSION_ID="$1"
VERSION="$2"

if [ -z "$EXTENSION_ID" ] || [ -z "$VERSION" ]; then
    echo "Usage: ./build-macos-zip.sh <extension_id> <version>"
    exit 1
fi

# Directories - Use absolute paths
BLOCK_DIR="$(cd "$(dirname "$0")" && pwd)"
HOST_DIR="$BLOCK_DIR"
REPO_ROOT="$(dirname "$HOST_DIR")"
BUILD_DIR="${HOST_DIR}/build"
DIST_DIR="${BUILD_DIR}/dist"
FINAL_ZIP="${HOST_DIR}/video-text-host-macos.zip"

echo "=== Building VideoTextHost (macOS) v${VERSION} ==="

# Clean build directories
rm -rf "${BUILD_DIR}"
rm -f "${FINAL_ZIP}"
mkdir -p "${BUILD_DIR}"

# PyInstaller options (Same as before)
PYINSTALLER_OPTIONS=(
    --name video-text-transcriber
    --windowed
    --collect-all faster_whisper
    --collect-all yt_dlp
    --collect-all opencc
    --collect-all ctranslate2
    --collect-all tokenizers
    --collect-data mutagen
    --collect-data brotli
    --collect-data certifi
    --collect-data secretstorage
    --collect-data curl_cffi
    --hidden-import=ctranslate2.converters.eole_ct2
    --hidden-import=faster_whisper.assets
    --hidden-import=opencc.__main__
    --hidden-import=tokenizers.tools
    --hidden-import=yt_dlp.compat._legacy
    --hidden-import=yt_dlp.compat._deprecated
    --hidden-import=yt_dlp.utils._legacy
    --hidden-import=yt_dlp.utils._deprecated
    --hidden-import=Cryptodome
    --hidden-import=mutagen
    --hidden-import=brotli
    --hidden-import=certifi
    --hidden-import=secretstorage
    --hidden-import=curl_cffi
    --target-arch arm64
    --clean
    --log-level=INFO
)

echo "--- Running PyInstaller ---"
cd "${REPO_ROOT}" # Ensure we run from repo root so relative imports work
pyinstaller "${PYINSTALLER_OPTIONS[@]}" \
    --workpath "${BUILD_DIR}/work" \
    --distpath "${DIST_DIR}" \
    --specpath "${BUILD_DIR}" \
    "${REPO_ROOT}/mini_transcriber.py"

echo "--- Organizing Files ---"
# We want the zip to contain a folder structure that is ready to run
# Structure inside ZIP:
#   video-text-transcriber/ (The executable bundle)
#   host-macos.sh
#   host.cjs
#   extension-id.txt

# Create a staging area
STAGING_DIR="${BUILD_DIR}/staging"
mkdir -p "${STAGING_DIR}"

# Copy executable bundle
cp -R "${DIST_DIR}/video-text-transcriber" "${STAGING_DIR}/"

# Copy helper scripts from native-host/
cp "${HOST_DIR}/host-macos.sh" "${STAGING_DIR}/"
cp "${HOST_DIR}/host.cjs" "${STAGING_DIR}/"
cp "${HOST_DIR}/host.cjs" "${STAGING_DIR}/"

# Write Extension ID
echo "${EXTENSION_ID}" > "${STAGING_DIR}/extension-id.txt"

# Ensure permissions
chmod +x "${STAGING_DIR}/host-macos.sh"
chmod +x "${STAGING_DIR}/video-text-transcriber/video-text-transcriber"

echo "--- Creating ZIP Archive ---"
cd "${STAGING_DIR}"
zip -r "${FINAL_ZIP}" .

echo "✅ Build Complete!"
echo "Artifact: ${FINAL_ZIP}"
