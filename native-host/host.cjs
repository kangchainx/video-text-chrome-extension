#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { spawn } = require('child_process');

const SERVICE_PORT = parseInt(process.env.TRANSCRIBER_PORT || '8001', 10);
const PYTHON_BIN = process.env.PYTHON_BIN || 'python3';
const DEFAULT_SCRIPT_PATH = path.resolve(__dirname, 'mini_transcriber.py');
const DEFAULT_TOKEN_PATH = path.resolve(__dirname, 'temp', 'service.token');
const DEFAULT_LOG_PATH = path.resolve(__dirname, 'temp', 'native-host.log');
const SCRIPT_PATH = process.env.TRANSCRIBER_SCRIPT || DEFAULT_SCRIPT_PATH;
const TOKEN_PATH = process.env.TRANSCRIBER_TOKEN_PATH || DEFAULT_TOKEN_PATH;
const LOG_PATH = process.env.NATIVE_HOST_LOG_PATH || DEFAULT_LOG_PATH;

let childProcess = null;
let lastStartAt = null;

function log(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`, 'utf8');
  } catch (_) {
    // Never write to stdout/stderr: it breaks native messaging.
  }
}

function readToken() {
  try {
    return fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  } catch (err) {
    return '';
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port: SERVICE_PORT,
        path: '/health',
        timeout: 1000,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForHealth(retries = 20) {
  for (let i = 0; i < retries; i += 1) {
    const ok = await checkHealth();
    if (ok) return true;
    await wait(300);
  }
  return false;
}

async function waitForToken(retries = 10) {
  for (let i = 0; i < retries; i += 1) {
    const token = readToken();
    if (token) return token;
    await wait(200);
  }
  return '';
}

function startService(token) {
  const env = {
    ...process.env,
    TRANSCRIBER_PORT: String(SERVICE_PORT),
    TRANSCRIBER_TOKEN: token,
  };
  log(`[host] startService python=${PYTHON_BIN} script=${SCRIPT_PATH} port=${SERVICE_PORT}`);
  childProcess = spawn(PYTHON_BIN, [SCRIPT_PATH], {
    env,
    detached: true,
    stdio: 'ignore',
  });
  childProcess.unref();
  lastStartAt = Date.now();
}

async function ensureRunning() {
  log('[host] ensureRunning');
  const running = await checkHealth();
  if (running) {
    const token = await waitForToken();
    if (!token) {
      return { ok: false, error: 'token_missing' };
    }
    return { ok: true, status: 'running', port: SERVICE_PORT, token };
  }

  let token = readToken();
  if (!token) {
    token = crypto.randomBytes(16).toString('hex');
  }

  startService(token);
  const ready = await waitForHealth();
  if (!ready) {
    log('[host] service_start_failed (health not ready)');
    return { ok: false, error: 'service_start_failed' };
  }

  const confirmedToken = (await waitForToken()) || token;
  return { ok: true, status: 'started', port: SERVICE_PORT, token: confirmedToken };
}

function getStatus() {
  return {
    ok: true,
    port: SERVICE_PORT,
    pid: childProcess ? childProcess.pid : null,
    lastStartAt,
    token: readToken(),
  };
}

function shutdown() {
  if (childProcess && childProcess.pid) {
    try {
      process.kill(-childProcess.pid);
      childProcess = null;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
  return { ok: false, error: 'not_running' };
}

function sendMessage(message) {
  const payload = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(payload.length, 0);
  process.stdout.write(header);
  process.stdout.write(payload);
}

let inputBuffer = Buffer.alloc(0);

function handleMessage(message) {
  if (!message || typeof message !== 'object') {
    sendMessage({ ok: false, error: 'invalid_message' });
    return;
  }
  const type = message.type;
  log(`[host] message type=${String(type)}`);
  if (type === 'ensureRunning') {
    ensureRunning()
      .then(sendMessage)
      .catch((err) => sendMessage({ ok: false, error: String(err) }));
    return;
  }
  if (type === 'getStatus') {
    sendMessage(getStatus());
    return;
  }
  if (type === 'shutdown') {
    sendMessage(shutdown());
    return;
  }
  sendMessage({ ok: false, error: 'unknown_type' });
}

process.stdin.on('data', (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  while (inputBuffer.length >= 4) {
    const messageLength = inputBuffer.readUInt32LE(0);
    if (inputBuffer.length < 4 + messageLength) {
      return;
    }
    const messageBody = inputBuffer.slice(4, 4 + messageLength).toString('utf8');
    inputBuffer = inputBuffer.slice(4 + messageLength);
    try {
      const message = JSON.parse(messageBody);
      handleMessage(message);
    } catch (err) {
      sendMessage({ ok: false, error: 'invalid_json' });
    }
  }
});

process.on('uncaughtException', (err) => {
  log(`[host] uncaughtException ${String(err && err.stack ? err.stack : err)}`);
  // Do not write to stdout/stderr; just exit to avoid protocol corruption.
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  log(`[host] unhandledRejection ${String(reason)}`);
  process.exit(1);
});

log(`[host] loaded port=${SERVICE_PORT} python=${PYTHON_BIN} script=${SCRIPT_PATH}`);
