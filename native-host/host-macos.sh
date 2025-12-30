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
# Prefer explicit PYTHON_BIN; otherwise try to detect python3 from PATH.
PYTHON_BIN="${PYTHON_BIN:-}"

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

TRANSCRIBER_BIN="${TRANSCRIBER_BIN:-${SCRIPT_DIR}/video-text-transcriber}"
USE_BIN=0
if [ -d "${TRANSCRIBER_BIN}" ] && [ -x "${TRANSCRIBER_BIN}/video-text-transcriber" ]; then
  TRANSCRIBER_BIN="${TRANSCRIBER_BIN}/video-text-transcriber"
  USE_BIN=1
elif [ -x "${TRANSCRIBER_BIN}" ]; then
  USE_BIN=1
fi

if [ "${USE_BIN}" -eq 0 ]; then
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
fi

export PYTHON_BIN
# Keep the service script alongside this host for a stable relative layout.
export TRANSCRIBER_SCRIPT="${TRANSCRIBER_SCRIPT:-${SCRIPT_DIR}/mini_transcriber.py}"
export TRANSCRIBER_BIN
if [ -z "${TRANSCRIBER_TOKEN_PATH:-}" ]; then
  BIN_DIR="$(dirname "${TRANSCRIBER_BIN}")"
  if [ "${USE_BIN}" -eq 1 ] && [ -n "${BIN_DIR}" ]; then
    export TRANSCRIBER_TOKEN_PATH="${BIN_DIR}/temp/service.token"
  else
    export TRANSCRIBER_TOKEN_PATH="${SCRIPT_DIR}/temp/service.token"
  fi
fi
export NATIVE_HOST_LOG_PATH="${NATIVE_HOST_LOG_PATH:-${SCRIPT_DIR}/temp/native-host.log}"
export TRANSCRIBER_PORT="${TRANSCRIBER_PORT:-8001}"

echo "NODE_BIN=${NODE_BIN}" >&2
echo "PYTHON_BIN=${PYTHON_BIN}" >&2
echo "TRANSCRIBER_BIN=${TRANSCRIBER_BIN}" >&2
echo "TRANSCRIBER_SCRIPT=${TRANSCRIBER_SCRIPT}" >&2
echo "TRANSCRIBER_PORT=${TRANSCRIBER_PORT}" >&2
echo "TRANSCRIBER_TOKEN_PATH=${TRANSCRIBER_TOKEN_PATH}" >&2
echo "NATIVE_HOST_LOG_PATH=${NATIVE_HOST_LOG_PATH}" >&2

exec "${NODE_BIN}" "${SCRIPT_DIR}/host.cjs"
