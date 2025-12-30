#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <EXTENSION_ID> <VERSION>" >&2
  exit 1
fi

EXTENSION_ID="$1"
VERSION="$2"

if [ ! -x "${SCRIPT_DIR}/uninstall-macos.sh" ]; then
  echo "uninstall-macos.sh not executable. Run: chmod +x ${SCRIPT_DIR}/uninstall-macos.sh" >&2
  exit 1
fi

echo "==> Uninstalling existing host..."
"${SCRIPT_DIR}/uninstall-macos.sh"

echo "==> Building pkg..."
if [ ! -x "${SCRIPT_DIR}/build-macos-pkg.sh" ]; then
  echo "build-macos-pkg.sh not executable. Run: chmod +x ${SCRIPT_DIR}/build-macos-pkg.sh" >&2
  exit 1
fi
"${SCRIPT_DIR}/build-macos-pkg.sh" "${EXTENSION_ID}" "${VERSION}"

echo "==> Installing pkg to current user..."
installer -pkg "${SCRIPT_DIR}/VideoTextHost.pkg" -target CurrentUserHomeDirectory

echo "==> Done."
