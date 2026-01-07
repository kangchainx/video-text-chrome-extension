import asyncio
import json
import os
import sqlite3
import sys
import multiprocessing
import threading
import time
import uuid
from collections import deque
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import Body, FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

CPU_THREADS = int(os.getenv("TRANSCRIBER_CPU_THREADS", "2"))
os.environ.setdefault("OMP_NUM_THREADS", str(CPU_THREADS))
os.environ.setdefault("MKL_NUM_THREADS", str(CPU_THREADS))
os.environ.setdefault("OPENBLAS_NUM_THREADS", str(CPU_THREADS))
os.environ.setdefault("NUMEXPR_NUM_THREADS", str(CPU_THREADS))

# Lazy loading placeholders
WhisperModel = None
yt_dlp = None

app = FastAPI(title="Mini Video Transcriber")

def _resolve_base_dir() -> Path:
    override = os.getenv("TRANSCRIBER_BASE_DIR")
    if override:
        return Path(override)
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


BASE_DIR = _resolve_base_dir()
TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(exist_ok=True)
DB_PATH = Path(os.getenv("TRANSCRIBER_DB_PATH", str(TEMP_DIR / "tasks.db")))
SERVICE_LOG_PATH = Path(os.getenv("TRANSCRIBER_SERVICE_LOG", str(TEMP_DIR / "service.log")))

def _log(message: str) -> None:
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime())
    formatted = f"{timestamp} {message}"
    try:
        SERVICE_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with SERVICE_LOG_PATH.open("a", encoding="utf-8", errors="ignore") as handle:
            handle.write(f"{formatted}\n")
    except OSError:
        pass
    # Always print to stderr so it can be captured by Native Messaging host logs or terminal
    try:
        print(formatted, file=sys.stderr)
    except (BrokenPipeError, OSError):
        # Ignore broken pipe errors when stderr is closed
        pass


def _log_slow(label: str, start: float, extra: str = "") -> None:
    elapsed = time.monotonic() - start
    if elapsed >= SLOW_LOG_SECONDS:
        suffix = f" {extra}".strip()
        _log(f"SLOW {label} elapsed={elapsed:.2f}s {suffix}".strip())

MODEL_SIZE = os.getenv("WHISPER_MODEL", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")
IDLE_SECONDS = int(os.getenv("TRANSCRIBER_IDLE_SECONDS", "3600"))
SLOW_LOG_SECONDS = float(os.getenv("TRANSCRIBER_SLOW_LOG_SECONDS", "5"))

SERVICE_PORT = int(os.getenv("TRANSCRIBER_PORT", "8001"))
SERVICE_TOKEN = os.getenv("TRANSCRIBER_TOKEN")
TOKEN_PATH = Path(os.getenv("TRANSCRIBER_TOKEN_PATH", str(TEMP_DIR / "service.token")))

_log(
    "SERVICE_START "
    f"pid={os.getpid()} base_dir={BASE_DIR} temp_dir={TEMP_DIR} port={SERVICE_PORT}"
)

if not SERVICE_TOKEN:
    SERVICE_TOKEN = uuid.uuid4().hex

token_source = "env" if os.getenv("TRANSCRIBER_TOKEN") else "auto"
_log(f"TOKEN_INIT source={token_source} path={TOKEN_PATH}")
try:
    TOKEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    TOKEN_PATH.write_text(SERVICE_TOKEN, encoding="utf-8")
    os.chmod(TOKEN_PATH, 0o600)
    _log("TOKEN_WRITE ok")
except OSError as exc:
    _log(f"TOKEN_WRITE failed error={exc}")

model_lock = threading.Lock()
whisper_model = None
model_ready = False
model_loading = False
model_error = None

# Will be updated by _preload_heavy_libs
MODEL_CACHE_PATH: Optional[Path] = None
MODEL_CACHED = False
OPENCC_T2S = None

def _detect_model_cache() -> Optional[Path]:
    override = os.getenv("WHISPER_MODEL_DIR") or os.getenv("WHISPER_CACHE_DIR")
    if override:
        candidate = Path(override)
        if candidate.exists():
            return candidate
    try:
        from faster_whisper.utils import get_downloaded_model_path

        candidate = Path(get_downloaded_model_path(MODEL_SIZE))
        if candidate.exists():
            return candidate
    except Exception:
        pass
    home = Path.home()
    candidates = [
        home / ".cache" / "whisper" / MODEL_SIZE,
        home / ".cache" / "whisper" / f"{MODEL_SIZE}-ct2",
        home / ".cache" / "faster-whisper" / MODEL_SIZE,
        home / ".cache" / "faster-whisper" / f"{MODEL_SIZE}-ct2",
        home / ".cache" / "huggingface" / "hub" / f"models--Systran--faster-whisper-{MODEL_SIZE}",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CookieItem(BaseModel):
    name: str
    value: str
    domain: str
    path: Optional[str] = "/"
    secure: Optional[bool] = False
    httpOnly: Optional[bool] = False
    expirationDate: Optional[float] = None
    hostOnly: Optional[bool] = None


class CreateTaskRequest(BaseModel):
    url: str
    title: Optional[str] = None
    site: Optional[str] = None
    cookies: Optional[List[CookieItem]] = None


class ClearQueueRequest(BaseModel):
    include_done: bool = False


class TaskCancelled(Exception):
    pass


TASK_STATUS_QUEUED = "queued"
TASK_STATUS_DOWNLOADING = "downloading"
TASK_STATUS_TRANSCRIBING = "transcribing"
TASK_STATUS_CANCELING = "canceling"
TASK_STATUS_DONE = "done"
TASK_STATUS_ERROR = "error"
TASK_STATUS_CANCELED = "canceled"


tasks: Dict[str, Dict[str, Any]] = {}
queue = deque()
active_task_id: Optional[str] = None
lock = threading.Lock()
condition = threading.Condition(lock)
db_lock = threading.Lock()
queue_sequence = int(time.time() * 1000)
last_activity = time.time()


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/status")
def service_status(request: Request, token: Optional[str] = Query(None)):
    _require_token(request, token)
    return {
        "status": "ok",
        "modelCached": MODEL_CACHED,
        "modelReady": model_ready,
        "modelLoading": model_loading,
        "modelError": model_error,
    }


@app.on_event("startup")
def _on_startup() -> None:
    _log("HTTP_READY")
    # Start background warmup of heavy libraries
    threading.Thread(target=_warmup_modules, daemon=True).start()


def _warmup_modules() -> None:
    """Import heavy libraries and initialize resources in background."""
    global yt_dlp, WhisperModel, OpenCC, MODEL_CACHE_PATH, MODEL_CACHED, OPENCC_T2S
    
    _log("")
    _log("=" * 60)
    _log("🚀 开始预热服务组件 (Starting service warmup)")
    _log("=" * 60)
    
    try:
        # 1. Warmup yt_dlp
        _log("")
        _log("📦 正在加载 yt-dlp 视频下载模块...")
        start = time.monotonic()
        import yt_dlp as _yt_dlp
        yt_dlp = _yt_dlp
        elapsed = time.monotonic() - start
        _log(f"✅ yt-dlp 加载完成，耗时 {elapsed:.2f}秒")
        
        # 2. Warmup faster_whisper
        _log("")
        _log("📦 正在加载 Whisper AI 转录模块...")
        start = time.monotonic()
        from faster_whisper import WhisperModel as _WhisperModel
        WhisperModel = _WhisperModel
        elapsed = time.monotonic() - start
        _log(f"✅ Whisper 模块加载完成，耗时 {elapsed:.2f}秒")
        
        # 3. Check model cache
        _log("")
        _log("🔍 检查本地模型缓存...")
        MODEL_CACHE_PATH = _detect_model_cache()
        MODEL_CACHED = MODEL_CACHE_PATH is not None
        if MODEL_CACHED:
            _log(f"✅ 找到缓存模型: {MODEL_CACHE_PATH}")
        else:
            _log("⚠️  未找到缓存模型，首次转录时将自动下载")

        # 4. Warmup OpenCC
        _log("")
        _log("📦 正在加载 OpenCC 繁简转换模块...")
        start = time.monotonic()
        try:
            from opencc import OpenCC as _OpenCC
            OpenCC = _OpenCC
            OPENCC_T2S = OpenCC("t2s")
            elapsed = time.monotonic() - start
            _log(f"✅ OpenCC 加载完成，耗时 {elapsed:.2f}秒")
        except ImportError:
            _log("⚠️  OpenCC 未安装，跳过繁简转换功能")
        
        _log("")
        _log("=" * 60)
        _log("🎉 服务预热完成！所有组件已就绪")
        _log("=" * 60)
        _log("")
            
    except Exception as exc:
        _log("")
        _log("=" * 60)
        _log(f"❌ 预热过程出错: {exc}")
        _log("=" * 60)
        _log("")
    
    _log("WARMUP_DONE")



def _require_token(request: Request, token: Optional[str]) -> None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        candidate = header.split(" ", 1)[1].strip()
    else:
        candidate = token
    if not candidate or candidate != SERVICE_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")


def _sanitize_filename(name: str) -> str:
    if not name:
        return "transcription"
    keep = []
    for ch in name:
        if ch.isalnum() or ch in " ._-()[]{}":
            keep.append(ch)
        else:
            keep.append("_")
    cleaned = "".join(keep).strip(" ._-")
    return cleaned[:80] or "transcription"


def _to_simplified(text: str) -> str:
    global OPENCC_T2S
    if not text:
        return text
    
    # Try to initialize if not yet ready (e.g. called before warmup finished)
    if OPENCC_T2S is None:
        try:
            from opencc import OpenCC
            OPENCC_T2S = OpenCC("t2s")
        except ImportError:
            return text
            
    try:
        return OPENCC_T2S.convert(text)
    except Exception:
        return text


def _get_whisper_model():
    global whisper_model, model_ready, model_loading, model_error, WhisperModel
    
    # Ensure WhisperModel class is available
    if WhisperModel is None:
        from faster_whisper import WhisperModel as _WM
        WhisperModel = _WM
    
    wait_logged = False
    while True:
        with model_lock:
            if whisper_model is not None:
                return whisper_model
            if not model_loading:
                model_loading = True
                model_error = None
                break
            if not wait_logged:
                wait_logged = True
        if wait_logged:
            _log("MODEL_INIT_WAIT")
        time.sleep(0.1)
    start = time.monotonic()
    _log(
        "MODEL_INIT_START "
        f"size={MODEL_SIZE} device={WHISPER_DEVICE} compute={WHISPER_COMPUTE} "
        f"cpu_threads={CPU_THREADS} num_workers=1"
    )
    try:
        model = WhisperModel(
            MODEL_SIZE,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE,
            cpu_threads=CPU_THREADS,
            num_workers=1,
        )
    except Exception as exc:
        model_error = str(exc)
        model_loading = False
        _log(f"MODEL_INIT_ERROR {model_error}")
        raise
    elapsed = time.monotonic() - start
    with model_lock:
        whisper_model = model
        model_ready = True
        model_loading = False
    _log(f"MODEL_INIT_DONE elapsed={elapsed:.2f}s")
    _log_slow("MODEL_INIT", start)
    return model


def _cookiefile_path(task_id: str) -> Path:
    return TEMP_DIR / f"cookies-{task_id}.txt"


def _write_cookies_file(cookies: List[CookieItem], path: Path) -> None:
    lines = [
        "# Netscape HTTP Cookie File",
        "# This file was generated by video-text-chrome-extension",
    ]
    for cookie in cookies:
        domain = cookie.domain
        include_subdomains = "FALSE" if cookie.hostOnly else "TRUE"
        if include_subdomains == "TRUE" and not domain.startswith("."):
            domain = "." + domain
        path_value = cookie.path or "/"
        secure_value = "TRUE" if cookie.secure else "FALSE"
        expires = int(cookie.expirationDate or 0)
        lines.append(
            "\t".join(
                [
                    domain,
                    include_subdomains,
                    path_value,
                    secure_value,
                    str(expires),
                    cookie.name,
                    cookie.value,
                ]
            )
        )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _needs_cookies(message: str) -> bool:
    lowered = message.lower()
    keywords = [
        "sign in",
        "login",
        "cookies",
        "private",
        "members",
        "only available",
        "age",
        "verification",
        "vip",
    ]
    return any(keyword in lowered for keyword in keywords)


def _task_public_view(task: Dict[str, Any], queue_positions: Dict[str, int]) -> Dict[str, Any]:
    return {
        "id": task["id"],
        "url": task["url"],
        "title": task.get("title"),
        "site": task.get("site"),
        "status": task["status"],
        "createdAt": task["createdAt"],
        "updatedAt": task["updatedAt"],
        "downloadProgress": task["downloadProgress"],
        "transcribeProgress": task["transcribeProgress"],
        "errorCode": task.get("errorCode"),
        "errorMessage": task.get("errorMessage"),
        "resultFilename": task.get("resultFilename"),
        "queuePosition": queue_positions.get(task["id"]),
    }


def _next_queue_order() -> int:
    global queue_sequence
    queue_sequence += 1
    return queue_sequence


def _db_connect() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


def _init_db() -> None:
    start = time.monotonic()
    _log("DB_INIT_START")
    with db_lock, _db_connect() as conn:
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT,
                site TEXT,
                status TEXT NOT NULL,
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL,
                download_progress INTEGER NOT NULL,
                transcribe_progress INTEGER NOT NULL,
                error_code TEXT,
                error_message TEXT,
                result_path TEXT,
                result_filename TEXT,
                audio_path TEXT,
                cookiefile_path TEXT,
                cancel_requested INTEGER NOT NULL,
                queue_order INTEGER
            )
            """
        )
        conn.commit()
    _log(f"DB_INIT_DONE elapsed={time.monotonic() - start:.2f}s")


def _db_upsert_task(task: Dict[str, Any]) -> None:
    with db_lock, _db_connect() as conn:
        conn.execute(
            """
            INSERT OR REPLACE INTO tasks (
                id,
                url,
                title,
                site,
                status,
                created_at,
                updated_at,
                download_progress,
                transcribe_progress,
                error_code,
                error_message,
                result_path,
                result_filename,
                audio_path,
                cookiefile_path,
                cancel_requested,
                queue_order
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                task["id"],
                task["url"],
                task.get("title"),
                task.get("site"),
                task["status"],
                task["createdAt"],
                task["updatedAt"],
                int(task.get("downloadProgress") or 0),
                int(task.get("transcribeProgress") or 0),
                task.get("errorCode"),
                task.get("errorMessage"),
                task.get("resultPath"),
                task.get("resultFilename"),
                task.get("audioPath"),
                task.get("cookiefilePath"),
                1 if task.get("cancelRequested") else 0,
                task.get("queueOrder"),
            ),
        )
        conn.commit()


def _db_delete_task(task_id: str) -> None:
    with db_lock, _db_connect() as conn:
        conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        conn.commit()


def _db_load_tasks() -> List[sqlite3.Row]:
    with db_lock, _db_connect() as conn:
        return conn.execute("SELECT * FROM tasks").fetchall()


def _load_tasks_from_db() -> None:
    global queue_sequence
    rows = _db_load_tasks()
    _log(f"DB_LOAD count={len(rows)}")
    if not rows:
        return
    now = time.time()
    tasks_to_persist: List[Dict[str, Any]] = []
    with lock:
        for row in rows:
            task = {
                "id": row["id"],
                "url": row["url"],
                "title": row["title"],
                "site": row["site"],
                "status": row["status"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
                "downloadProgress": row["download_progress"],
                "transcribeProgress": row["transcribe_progress"],
                "errorCode": row["error_code"],
                "errorMessage": row["error_message"],
                "resultPath": row["result_path"],
                "resultFilename": row["result_filename"],
                "audioPath": row["audio_path"],
                "cookiefilePath": row["cookiefile_path"],
                "cancelRequested": bool(row["cancel_requested"]),
                "queueOrder": row["queue_order"],
            }

            if task["status"] in (TASK_STATUS_DOWNLOADING, TASK_STATUS_TRANSCRIBING):
                task["status"] = TASK_STATUS_ERROR
                task["errorCode"] = "interrupted"
                task["errorMessage"] = "任务已取消，请重试"
                task["updatedAt"] = now
                tasks_to_persist.append(task)
            elif task["status"] == TASK_STATUS_CANCELING:
                task["status"] = TASK_STATUS_CANCELED
                task["errorCode"] = None
                task["errorMessage"] = None
                task["downloadProgress"] = 0
                task["transcribeProgress"] = 0
                task["updatedAt"] = now
                tasks_to_persist.append(task)

            tasks[task["id"]] = task

        existing_orders = [
            task["queueOrder"]
            for task in tasks.values()
            if task.get("queueOrder") is not None
        ]
        queue_sequence = max(existing_orders, default=int(now * 1000))

        queued = [task for task in tasks.values() if task["status"] == TASK_STATUS_QUEUED]
        for task in queued:
            if task.get("queueOrder") is None:
                task["queueOrder"] = _next_queue_order()
                task["updatedAt"] = now
                tasks_to_persist.append(task)
        queued.sort(key=lambda item: item.get("queueOrder") or item["createdAt"])
        queue.clear()
        queue.extend([task["id"] for task in queued])

    for task in tasks_to_persist:
        _db_upsert_task(task)


def _snapshot_tasks() -> Dict[str, Any]:
    with lock:
        queue_positions = {task_id: idx + 1 for idx, task_id in enumerate(queue)}
        snapshot = [_task_public_view(task, queue_positions) for task in tasks.values()]
        snapshot.sort(key=lambda item: item["createdAt"])
        return {
            "tasks": snapshot,
            "activeTaskId": active_task_id,
        }


def _touch_activity() -> None:
    global last_activity
    last_activity = time.time()


def _update_task(task_id: str, **updates: Any) -> None:
    with lock:
        task = tasks.get(task_id)
        if not task:
            return
        current_status = task.get("status")
        if current_status == TASK_STATUS_CANCELED:
            if updates.get("status") != TASK_STATUS_CANCELED:
                updates.pop("status", None)
            for key in (
                "downloadProgress",
                "transcribeProgress",
                "errorCode",
                "errorMessage",
                "resultPath",
                "resultFilename",
                "audioPath",
            ):
                updates.pop(key, None)
            if not updates:
                return
        elif current_status == TASK_STATUS_CANCELING:
            if updates.get("status") not in (TASK_STATUS_CANCELING, TASK_STATUS_CANCELED):
                updates.pop("status", None)
            for key in (
                "downloadProgress",
                "transcribeProgress",
                "errorCode",
                "errorMessage",
                "resultPath",
                "resultFilename",
                "audioPath",
            ):
                if updates.get("status") != TASK_STATUS_CANCELED:
                    updates.pop(key, None)
            if not updates:
                return
        task.update(updates)
        task["updatedAt"] = time.time()
        _db_upsert_task(task)
        _touch_activity()


def _mark_canceled(task_id: str) -> None:
    _update_task(
        task_id,
        status=TASK_STATUS_CANCELED,
        errorCode=None,
        errorMessage=None,
        downloadProgress=0,
        transcribeProgress=0,
    )


def _clear_task_files(task: Dict[str, Any]) -> None:
    for key in ("audioPath", "resultPath", "cookiefilePath"):
        path = task.get(key)
        if not path:
            continue
        try:
            Path(path).unlink(missing_ok=True)
        except OSError:
            pass


def _enqueue(task_id: str) -> None:
    with condition:
        queue.append(task_id)
        _touch_activity()
        condition.notify()


def _is_cancelled(task_id: str) -> bool:
    with lock:
        task = tasks.get(task_id)
        return bool(task and task.get("cancelRequested"))


def _resolve_audio_path(task_id: str, prepared_filename: str) -> Path:
    mp3_path = Path(prepared_filename).with_suffix(".mp3")
    if mp3_path.exists():
        return mp3_path
    candidates = list(TEMP_DIR.glob(f"{task_id}.*"))
    if candidates:
        return candidates[0]
    raise RuntimeError("音频文件未生成")


def _detect_ffmpeg() -> Optional[str]:
    # 1. Check env var
    override = os.getenv("FFMPEG_BINARY")
    if override and os.path.exists(override):
        _log(f"FFMPEG: Found in env var: {override}")
        return override

    # 2. Check system PATH
    import shutil
    path_ffmpeg = shutil.which("ffmpeg")
    if path_ffmpeg:
        _log(f"FFMPEG: Found in PATH: {path_ffmpeg}")
        return None  # Let yt-dlp find it in PATH

    # 3. Check common macOS/Linux paths
    candidates = [
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
        "/bin/ffmpeg",
    ]
    for c in candidates:
        if os.path.exists(c) and os.access(c, os.X_OK):
            _log(f"FFMPEG: Found in system candidate: {c}")
            return c
            
    # 4. Check relative to binary (Windows/bundled)
    # Check inside 'ffmpeg' subdirectory if it exists
    bundled_dir = BASE_DIR / "ffmpeg"
    _log(f"FFMPEG: Checking bundled dir: {bundled_dir} (exists={bundled_dir.is_dir()})")
    
    if bundled_dir.is_dir():
        for name in ["ffmpeg.exe", "ffmpeg"]:
            candidate = bundled_dir / name
            exists = candidate.is_file()
            # _log(f"FFMPEG: Checking {candidate} -> {exists}")
            if exists:
                if os.access(candidate, os.X_OK):
                    _log(f"FFMPEG: Found bundled in subdir: {candidate}")
                    return str(candidate)
                else:
                    _log(f"FFMPEG: Found bundled but NOT EXECUTABLE: {candidate}")

    # Check in base directory
    for name in ["ffmpeg.exe", "ffmpeg"]:
        candidate = BASE_DIR / name
        exists = candidate.is_file()
        if exists:
            if os.access(candidate, os.X_OK):
                _log(f"FFMPEG: Found bundled in root: {candidate}")
                return str(candidate)
            else:
                 _log(f"FFMPEG: Found bundled in root but NOT EXECUTABLE: {candidate}")

    _log("FFMPEG: Not found anywhere")
    return None


def _run_yt_dlp(url: str, ydl_opts: dict, task_id: str) -> Path:
    import yt_dlp
    
    # Inject ffmpeg location if detected and not in PATH
    if "ffmpeg_location" not in ydl_opts:
        ffmpeg_bin = _detect_ffmpeg()
        if ffmpeg_bin:
            ydl_opts["ffmpeg_location"] = ffmpeg_bin

    _log(f"DEBUG: ydl_opts['ffmpeg_location'] = {ydl_opts.get('ffmpeg_location')}")
            
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        prepared_filename = ydl.prepare_filename(info)
        return _resolve_audio_path(task_id, prepared_filename)


def _download_audio(task_id: str, url: str, cookiefile: Optional[str]) -> Path:
    outtmpl = str(TEMP_DIR / f"{task_id}.%(ext)s")

    def progress_hook(data: Dict[str, Any]) -> None:
        if _is_cancelled(task_id):
            raise TaskCancelled("download canceled")
        if data.get("status") == "downloading":
            total = data.get("total_bytes") or data.get("total_bytes_estimate")
            downloaded = data.get("downloaded_bytes") or 0
            if total:
                progress = min(100, int(downloaded / total * 100))
                _update_task(task_id, downloadProgress=progress)
        elif data.get("status") == "finished":
            _update_task(task_id, downloadProgress=100)

    base_opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "quiet": True,
        "noplaylist": True,
        "progress_hooks": [progress_hook],
        "js_runtimes": {"node": {}},
        "remote_components": ["ejs:github"],
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "192",
            }
        ],
    }

    try:
        opts = base_opts.copy()
        if cookiefile and os.path.exists(cookiefile):
            opts["cookiefile"] = cookiefile
        return _run_yt_dlp(url, opts, task_id)
    except Exception as exc:
        raise RuntimeError(f"下载音频失败: {exc}")


def _transcribe_audio(task_id: str, audio_path: Path) -> str:
    if not model_ready:
        _log(f"MODEL_LOAD_PENDING task={task_id}")
    model = _get_whisper_model()
    segments, info = model.transcribe(str(audio_path), language="zh")
    total_duration = getattr(info, "duration", None) or 0
    parts = []
    for segment in segments:
        if _is_cancelled(task_id):
            raise TaskCancelled("transcribe canceled")
        parts.append(segment.text)
        if total_duration:
            progress = min(100, int(segment.end / total_duration * 100))
            _update_task(task_id, transcribeProgress=progress)
    _update_task(task_id, transcribeProgress=100)
    text = "".join(parts).strip()
    return _to_simplified(text)


def _process_task(task_id: str) -> None:
    with lock:
        task = tasks.get(task_id)
    if not task:
        return

    _update_task(
        task_id,
        status=TASK_STATUS_DOWNLOADING,
        downloadProgress=0,
        transcribeProgress=0,
        errorCode=None,
        errorMessage=None,
    )

    try:
        download_start = time.monotonic()
        audio_path = _download_audio(task_id, task["url"], task.get("cookiefilePath"))
        _log_slow("DOWNLOAD", download_start, f"task={task_id}")
        _update_task(task_id, audioPath=str(audio_path))

        if _is_cancelled(task_id):
            raise TaskCancelled("download canceled")

        _update_task(task_id, status=TASK_STATUS_TRANSCRIBING, transcribeProgress=0)
        transcribe_start = time.monotonic()
        text = _transcribe_audio(task_id, audio_path)
        _log_slow("TRANSCRIBE", transcribe_start, f"task={task_id}")

        if _is_cancelled(task_id):
            raise TaskCancelled("transcribe canceled")

        filename = _sanitize_filename(task.get("title") or "transcription") + ".txt"
        result_path = TEMP_DIR / f"{task_id}.txt"
        result_path.write_text(text, encoding="utf-8")

        _update_task(
            task_id,
            status=TASK_STATUS_DONE,
            resultPath=str(result_path),
            resultFilename=filename,
        )
    except TaskCancelled:
        _mark_canceled(task_id)
        with lock:
            task = tasks.get(task_id)
        if task:
            _clear_task_files(task)
    except Exception as exc:
        message = str(exc)
        error_code = "download_failed"
        if _needs_cookies(message) and not task.get("cookiefilePath"):
            error_code = "cookies_required"
        _update_task(
            task_id,
            status=TASK_STATUS_ERROR,
            errorCode=error_code,
            errorMessage=message,
        )
    finally:
        _update_task(task_id, downloadProgress=task.get("downloadProgress", 0))


def _worker_loop() -> None:
    global active_task_id
    while True:
        with condition:
            while not queue:
                condition.wait()
            task_id = queue.popleft()
            active_task_id = task_id
            _touch_activity()
        try:
            _process_task(task_id)
        finally:
            with lock:
                active_task_id = None


def _idle_monitor_loop() -> None:
    if IDLE_SECONDS <= 0:
        return
    while True:
        time.sleep(5)
        with lock:
            has_active = bool(queue) or active_task_id is not None
            idle_for = time.time() - last_activity
        if has_active:
            continue
        if idle_for >= IDLE_SECONDS:
            _log("SERVICE_EXIT_IDLE")
            os._exit(0)


_init_db()
_load_tasks_from_db()
worker = threading.Thread(target=_worker_loop, daemon=True)
worker.start()
_log("WORKER_READY")
idle_monitor = threading.Thread(target=_idle_monitor_loop, daemon=True)
idle_monitor.start()
_log("IDLE_MONITOR_READY")


@app.get("/api/tasks")
def list_tasks(request: Request, token: Optional[str] = Query(None)):
    _require_token(request, token)
    return JSONResponse(_snapshot_tasks())


@app.post("/api/tasks")
def create_task(
    request: Request,
    payload: CreateTaskRequest = Body(...),
    token: Optional[str] = Query(None),
):
    _require_token(request, token)
    if not payload.url.startswith("http"):
        raise HTTPException(status_code=400, detail="无效的URL")
    task_id = uuid.uuid4().hex
    now = time.time()
    cookiefile_path = None
    if payload.cookies:
        cookiefile_path = str(_cookiefile_path(task_id))
        _write_cookies_file(payload.cookies, Path(cookiefile_path))

    task = {
        "id": task_id,
        "url": payload.url,
        "title": payload.title,
        "site": payload.site,
        "status": TASK_STATUS_QUEUED,
        "createdAt": now,
        "updatedAt": now,
        "downloadProgress": 0,
        "transcribeProgress": 0,
        "errorCode": None,
        "errorMessage": None,
        "resultPath": None,
        "resultFilename": None,
        "audioPath": None,
        "cookiefilePath": cookiefile_path,
        "cancelRequested": False,
        "queueOrder": _next_queue_order(),
    }

    with lock:
        tasks[task_id] = task
        _db_upsert_task(task)

    _enqueue(task_id)
    snapshot = _snapshot_tasks()
    return JSONResponse({"task": _task_public_view(task, {}), "snapshot": snapshot})


@app.post("/api/tasks/{task_id}/cancel")
def cancel_task(request: Request, task_id: str, token: Optional[str] = Query(None)):
    _require_token(request, token)
    should_mark = False
    should_canceling = False
    with lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task["status"] == TASK_STATUS_QUEUED:
            try:
                queue.remove(task_id)
            except ValueError:
                pass
            should_mark = True
        if task["status"] in (TASK_STATUS_DOWNLOADING, TASK_STATUS_TRANSCRIBING):
            should_canceling = True
        if task["status"] in (TASK_STATUS_DONE, TASK_STATUS_ERROR, TASK_STATUS_CANCELED):
            should_mark = True
        if task["status"] == TASK_STATUS_CANCELING:
            return JSONResponse({"ok": True})
    if should_canceling:
        _update_task(task_id, status=TASK_STATUS_CANCELING, cancelRequested=True)
    if should_mark:
        _mark_canceled(task_id)
    return JSONResponse({"ok": True})


@app.post("/api/tasks/{task_id}/retry")
def retry_task(request: Request, task_id: str, token: Optional[str] = Query(None)):
    _require_token(request, token)
    with lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task["status"] in (TASK_STATUS_DOWNLOADING, TASK_STATUS_TRANSCRIBING, TASK_STATUS_CANCELING):
            raise HTTPException(status_code=400, detail="任务正在执行")
        task["status"] = TASK_STATUS_QUEUED
        task["downloadProgress"] = 0
        task["transcribeProgress"] = 0
        task["errorCode"] = None
        task["errorMessage"] = None
        task["cancelRequested"] = False
        task["queueOrder"] = _next_queue_order()
        task["updatedAt"] = time.time()
        _db_upsert_task(task)
    _enqueue(task_id)
    return JSONResponse({"ok": True})


@app.delete("/api/tasks/{task_id}")
def delete_task(request: Request, task_id: str, token: Optional[str] = Query(None)):
    _require_token(request, token)
    with lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task["status"] in (TASK_STATUS_DOWNLOADING, TASK_STATUS_TRANSCRIBING, TASK_STATUS_CANCELING):
            raise HTTPException(status_code=400, detail="任务正在执行")
        try:
            queue.remove(task_id)
        except ValueError:
            pass
        tasks.pop(task_id, None)
        _db_delete_task(task_id)
    _clear_task_files(task)
    return JSONResponse({"ok": True})


@app.post("/api/tasks/clear")
def clear_tasks(
    request: Request,
    payload: ClearQueueRequest = Body(...),
    token: Optional[str] = Query(None),
):
    _require_token(request, token)
    with lock:
        queue.clear()
        if payload.include_done:
            removable = [
                task_id
                for task_id, task in tasks.items()
                if task["status"] in (TASK_STATUS_DONE, TASK_STATUS_ERROR, TASK_STATUS_CANCELED)
            ]
            for task_id in removable:
                task = tasks.pop(task_id, None)
                if task:
                    _clear_task_files(task)
                _db_delete_task(task_id)
        else:
            for task_id, task in tasks.items():
                if task["status"] == TASK_STATUS_QUEUED:
                    task["status"] = TASK_STATUS_CANCELED
                    task["updatedAt"] = time.time()
    return JSONResponse({"ok": True})


@app.post("/api/tasks/{task_id}/cookies")
def set_task_cookies(
    request: Request,
    task_id: str,
    cookies: List[CookieItem] = Body(...),
    token: Optional[str] = Query(None),
):
    _require_token(request, token)
    with lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
    cookiefile_path = _cookiefile_path(task_id)
    _write_cookies_file(cookies, cookiefile_path)
    _update_task(task_id, cookiefilePath=str(cookiefile_path))
    return JSONResponse({"ok": True})


@app.get("/api/tasks/stream")
async def stream_tasks(request: Request, token: Optional[str] = Query(None)):
    _require_token(request, token)

    async def event_generator():
        while True:
            snapshot = _snapshot_tasks()
            payload = json.dumps(snapshot, ensure_ascii=False)
            yield f"data: {payload}\n\n"
            await asyncio.sleep(1)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


@app.get("/api/tasks/{task_id}/result")
def download_result(request: Request, task_id: str, token: Optional[str] = Query(None)):
    _require_token(request, token)
    with lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="任务不存在")
        if task["status"] != TASK_STATUS_DONE or not task.get("resultPath"):
            raise HTTPException(status_code=400, detail="任务未完成")
        result_path = task["resultPath"]
        filename = task.get("resultFilename") or "transcription.txt"
    return FileResponse(path=result_path, filename=filename, media_type="text/plain")


if __name__ == "__main__":
    import uvicorn
    import signal

    multiprocessing.freeze_support()

    def _on_signal(sig, frame):
        _log(f"SERVICE_EXIT_SIGNAL signal={sig}")
        os._exit(0)

    signal.signal(signal.SIGTERM, _on_signal)
    signal.signal(signal.SIGINT, _on_signal)

    _log(f"WEB_CONCURRENCY={os.environ.get('WEB_CONCURRENCY')}")
    _log(
        "MODEL_CONFIG="
        f"{MODEL_SIZE} device={WHISPER_DEVICE} compute={WHISPER_COMPUTE} "
        f"cpu_threads={CPU_THREADS} num_workers=1 idle_seconds={IDLE_SECONDS}"
    )
    os.environ.pop("WEB_CONCURRENCY", None)
    os.environ.pop("UVICORN_WORKERS", None)
    try:
        uvicorn.run(app, host="127.0.0.1", port=SERVICE_PORT, workers=1, reload=False)
    except Exception as exc:
        _log(f"SERVICE_CRASH error={exc}")
        raise
