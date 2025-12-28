#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# IMPORTANT: Native Messaging uses stdout for the protocol. Do NOT redirect stdout.
# Redirect stderr to a log file to debug why the host exits.
LOG_FILE="${NATIVE_HOST_LOG_FILE:-${SCRIPT_DIR}/temp/native-host-wrapper.log}"
mkdir -p "$(dirname "${LOG_FILE}")" 2>/dev/null || true
exec 2>>"${LOG_FILE}"
echo "---- $(date -Iseconds) native-host wrapper start ----" >&2
echo "SCRIPT_DIR=${SCRIPT_DIR}" >&2

# Chrome launches Native Messaging hosts with a limited PATH.
# Try to locate Node/Python robustly (Homebrew, system, nvm).
NODE_BIN="${NODE_BIN:-}"
# Prefer project venv Python; override by setting PYTHON_BIN explicitly.
PYTHON_BIN="${PYTHON_BIN:-/Users/chris/Documents/GitHub/video-text-chrome-extension/.venv/bin/python3}"

if [ -z "${NODE_BIN}" ]; then
  if command -v node >/dev/null 2>&1; then
    NODE_BIN="$(command -v node)"
  elif [ -x "/opt/homebrew/bin/node" ]; then
    NODE_BIN="/opt/homebrew/bin/node"
  elif [ -x "/usr/local/bin/node" ]; then
    NODE_BIN="/usr/local/bin/node"
  else
    # Try nvm-installed node
    NVM_CANDIDATE="$(ls -1 "${HOME}/.nvm/versions/node/"*/bin/node 2>/dev/null | sort -V | tail -n 1 || true)"
    if [ -n "${NVM_CANDIDATE}" ] && [ -x "${NVM_CANDIDATE}" ]; then
      NODE_BIN="${NVM_CANDIDATE}"
    fi
  fi
fi

if [ -z "${NODE_BIN}" ] || [ ! -x "${NODE_BIN}" ]; then
  echo "node not found" >&2
  exit 127
fi

if [ -z "${PYTHON_BIN}" ]; then
  if command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v python3)"
  elif [ -x "/usr/bin/python3" ]; then
    PYTHON_BIN="/usr/bin/python3"
  fi
fi

if [ -z "${PYTHON_BIN}" ] || [ ! -x "${PYTHON_BIN}" ]; then
  echo "python3 not found" >&2
  exit 127
fi

export PYTHON_BIN
# Keep the service script alongside this host for a stable relative layout.
export TRANSCRIBER_SCRIPT="${TRANSCRIBER_SCRIPT:-${SCRIPT_DIR}/mini_transcriber.py}"
export TRANSCRIBER_TOKEN_PATH="${TRANSCRIBER_TOKEN_PATH:-${SCRIPT_DIR}/temp/service.token}"
export NATIVE_HOST_LOG_PATH="${NATIVE_HOST_LOG_PATH:-${SCRIPT_DIR}/temp/native-host.log}"
export TRANSCRIBER_PORT="${TRANSCRIBER_PORT:-8001}"

echo "NODE_BIN=${NODE_BIN}" >&2
echo "PYTHON_BIN=${PYTHON_BIN}" >&2
echo "TRANSCRIBER_SCRIPT=${TRANSCRIBER_SCRIPT}" >&2
echo "TRANSCRIBER_PORT=${TRANSCRIBER_PORT}" >&2

exec "${NODE_BIN}" "${SCRIPT_DIR}/host.cjs"
