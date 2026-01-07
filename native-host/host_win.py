import sys
import os
import struct
import json
import time
import subprocess
import threading
import urllib.request
import urllib.error

# Windows Native Host Wrapper (Python)
# Replaces host.cjs for Windows environment to avoid Node.js dependency.
# This script should be compiled by PyInstaller into the SAME folder as the main service.

# Configuration
SERVICE_PORT = int(os.environ.get("TRANSCRIBER_PORT", "8001"))
# In the PyInstaller onedir distribution, executables are in the same root dir.
# We assume this script is built as 'native-host.exe' and placed alongside 'video-text-transcriber.exe'.
BASE_DIR = os.path.dirname(os.path.abspath(sys.argv[0]))
DEFAULT_BIN_PATH = os.path.join(BASE_DIR, "video-text-transcriber.exe") 
# Fallback for dev environment (running as script)
if not os.path.exists(DEFAULT_BIN_PATH):
    DEFAULT_BIN_PATH = os.path.join(BASE_DIR, "video-text-transcriber", "video-text-transcriber.exe")

TEMP_DIR = os.path.join(BASE_DIR, "temp")
TOKEN_PATH = os.environ.get("TRANSCRIBER_TOKEN_PATH", os.path.join(TEMP_DIR, "service.token"))
LOG_PATH = os.environ.get("NATIVE_HOST_LOG_PATH", os.path.join(TEMP_DIR, "native-host.log"))

CHILD_PROCESS = None

def log(message):
    try:
        os.makedirs(os.path.dirname(LOG_PATH), exist_ok=True)
        timestamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"{timestamp} {message}\n")
    except Exception:
        pass

def read_token():
    try:
        if os.path.exists(TOKEN_PATH):
            with open(TOKEN_PATH, "r", encoding="utf-8") as f:
                return f.read().strip()
    except Exception:
        pass
    return ""

def check_health():
    try:
        url = f"http://127.0.0.1:{SERVICE_PORT}/health"
        with urllib.request.urlopen(url, timeout=1) as response:
            return response.status == 200
    except Exception:
        return False

def start_service(token):
    global CHILD_PROCESS
    
    bin_path = os.environ.get("TRANSCRIBER_BIN", DEFAULT_BIN_PATH)
    if not os.path.exists(bin_path):
        # Fallback: maybe we are in a dev env and want to run python explicitly?
        # For now, simplistic approach: assume exe exists.
        log(f"[host] error: binary not found at {bin_path}")
        return

    env = os.environ.copy()
    env["TRANSCRIBER_PORT"] = str(SERVICE_PORT)
    env["TRANSCRIBER_TOKEN"] = token
    env["TRANSCRIBER_TOKEN_PATH"] = TOKEN_PATH
    env["TRANSCRIBER_BASE_DIR"] = BASE_DIR
    
    log(f"[host] startService command={bin_path} port={SERVICE_PORT}")
    
    try:
        # DETACHED_PROCESS = 0x00000008
        # CREATE_NEW_PROCESS_GROUP = 0x00000200
        creationflags = 0x00000008 | 0x00000200
        
        # We redirect stderr to a pipe to log it, but we can't block.
        # For simplicity in this lightweight host, we might just let it write to a file or ignore.
        # Let's ignore stdio for the detached process to ensure independence.
        CHILD_PROCESS = subprocess.Popen(
            [bin_path],
            env=env,
            creationflags=creationflags,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL, # TODO: Redirect to log file if debugging needed
            close_fds=True
        )
        log(f"[host] service spawned pid={CHILD_PROCESS.pid}")
    except Exception as e:
        log(f"[host] service_spawn_error {e}")

def ensure_running():
    log("[host] ensureRunning")
    if check_health():
        log("[host] health_ok already running")
        token = read_token()
        if not token:
            log("[host] token_missing")
            return {"ok": False, "error": "token_missing"}
        return {"ok": True, "status": "running", "port": SERVICE_PORT, "token": token}

    token = read_token()
    if not token:
        import uuid
        token = uuid.uuid4().hex
    
    start_service(token)
    log("[host] service_starting (health pending)")
    return {"ok": True, "status": "starting", "port": SERVICE_PORT, "token": token}

def get_status():
    return {
        "ok": True,
        "port": SERVICE_PORT,
        "token": read_token()
    }

def send_message(msg):
    try:
        json_msg = json.dumps(msg, separators=(',', ':'))
        encoded = json_msg.encode('utf-8')
        # Write length prefix (4 bytes, little endian)
        sys.stdout.buffer.write(struct.pack('<I', len(encoded)))
        # Write content
        sys.stdout.buffer.write(encoded)
        sys.stdout.buffer.flush()
    except Exception as e:
        log(f"[host] send_message error: {e}")

def handle_message(msg_type):
    if msg_type == "ensureRunning":
        res = ensure_running()
        send_message(res)
    elif msg_type == "getStatus":
        send_message(get_status())
    elif msg_type == "shutdown":
        # We don't really support killing the detached service from here yet
        send_message({"ok": True})
    else:
        send_message({"ok": False, "error": "unknown_type"})

def main():
    log(f"[host] loaded port={SERVICE_PORT}")
    
    # Windows stdin binary mode
    try:
        import msvcrt
        msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
        msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    except ImportError:
        pass
    
    while True:
        try:
            # Read 4 bytes length
            raw_len = sys.stdin.buffer.read(4)
            if len(raw_len) < 4:
                break
            msg_len = struct.unpack('<I', raw_len)[0]
            
            # Read message body
            msg_body = sys.stdin.buffer.read(msg_len)
            if len(msg_body) < msg_len:
                break
                
            msg_obj = json.loads(msg_body.decode('utf-8'))
            log(f"[host] message type={msg_obj.get('type')}")
            handle_message(msg_obj.get('type'))
            
        except Exception as e:
            log(f"[host] loop error: {e}")
            break

if __name__ == "__main__":
    main()
