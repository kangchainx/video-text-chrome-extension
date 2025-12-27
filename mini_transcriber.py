import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Form, HTTPException
from pydantic import BaseModel
import yt_dlp
from faster_whisper import WhisperModel

app = FastAPI(title="Mini Video Transcriber")

BASE_DIR = Path(__file__).parent
DOWNLOAD_DIR = BASE_DIR / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE = os.getenv("WHISPER_COMPUTE", "int8")

whisper_model = WhisperModel(MODEL_SIZE, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)


class TranscribeResponse(BaseModel):
    audio_path: str
    text: str


def _resolve_audio_path(task_id: str, prepared_filename: str) -> Path:
    mp3_path = Path(prepared_filename).with_suffix(".mp3")
    if mp3_path.exists():
        return mp3_path
    candidates = list(DOWNLOAD_DIR.glob(f"{task_id}.*"))
    if candidates:
        return candidates[0]
    raise RuntimeError("音频文件未生成")


def _run_yt_dlp(url: str, ydl_opts: dict, task_id: str) -> Path:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        prepared_filename = ydl.prepare_filename(info)
        return _resolve_audio_path(task_id, prepared_filename)


def download_audio(url: str, cookiefile: Optional[str] = None) -> Path:
    task_id = uuid.uuid4().hex
    outtmpl = str(DOWNLOAD_DIR / f"{task_id}.%(ext)s")

    base_opts = {
        "format": "bestaudio/best",
        "outtmpl": outtmpl,
        "quiet": True,
        "noplaylist": True,
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "mp3",
            "preferredquality": "192",
        }],
    }

    last_error: Optional[Exception] = None

    # 1) Try cookies from browser (default to Chrome)
    try:
        opts = {**base_opts, "cookiesfrombrowser": ("chrome",)}
        return _run_yt_dlp(url, opts, task_id)
    except Exception as exc:
        last_error = exc

    # 2) Fallback to cookiefile (user exported cookies.txt)
    cookiefile = cookiefile or os.getenv("YTDLP_COOKIEFILE")
    if cookiefile:
        try:
            opts = {**base_opts, "cookiefile": cookiefile}
            return _run_yt_dlp(url, opts, task_id)
        except Exception as exc:
            last_error = exc

    raise RuntimeError(f"下载音频失败: {last_error}")


def transcribe_audio(audio_path: Path) -> str:
    segments, _ = whisper_model.transcribe(str(audio_path))
    return "".join(seg.text for seg in segments).strip()


@app.post("/api/transcribe", response_model=TranscribeResponse)
def transcribe(url: str = Form(...), cookiefile: Optional[str] = Form(None)):
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="无效的URL")
    try:
        audio_path = download_audio(url, cookiefile=cookiefile)
        text = transcribe_audio(audio_path)
        return TranscribeResponse(audio_path=str(audio_path), text=text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8001)
