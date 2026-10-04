"""One-shot OpenRouter transcription with optional local audio debugging.

Request shape follows the live_stt OpenRouter engine (JSON base64 input_audio), but runs
in-process so the demo needs no extra container. The model is switchable via STT_MODEL.
"""

import base64
from datetime import datetime, timezone
import logging
import os
from pathlib import Path
from uuid import uuid4
import time

import httpx

from app.stt import TranscriptionError
from app.config import SERVER_DIR
from app.audio_processing import prepare_audio
from app.transcript_processing import postprocess_transcript

DEFAULT_MODEL = "openai/whisper-large-v3"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
TIMEOUT_S = 10.0
FORMATS = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/wave": "wav", "audio/x-wav": "wav"}
transport: httpx.BaseTransport | None = None  # tests inject httpx.MockTransport


def save_debug_audio(audio_bytes: bytes, fmt: str) -> None:
    """Save the exact outgoing bytes only when local debugging is enabled."""
    directory = os.environ.get("STT_AUDIO_DEBUG_DIR", "").strip()
    if not directory:
        return
    path = Path(directory)
    if not path.is_absolute():
        path = SERVER_DIR / path
    name = f"{datetime.now(timezone.utc):%Y%m%dT%H%M%S_%fZ}_{uuid4().hex}.{fmt}"
    logger = logging.getLogger("voice_agent.stt")
    try:
        path.mkdir(parents=True, exist_ok=True)
        with (path / name).open("xb") as output:
            output.write(audio_bytes)
    except OSError as exc:
        # A debug disk failure must not prevent transcription or expose audio.
        logger.warning("Audio debug save failed: %s", type(exc).__name__)
    else:
        logger.info("Audio debug saved: %s", path / name)


def transcribe_whisper(audio_bytes: bytes, mime: str) -> str:
    deadline = time.monotonic() + 22  # Includes preprocessing; browser upload timeout is 25 s.
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise TranscriptionError("provider_error")
    fmt = FORMATS.get(mime.split(";", 1)[0].strip().casefold())
    if fmt is None:
        raise TranscriptionError("unsupported_format")
    chunks = prepare_audio(audio_bytes, fmt)
    if not chunks:
        return ""
    model = os.environ.get("STT_MODEL") or DEFAULT_MODEL
    texts = []
    for chunk in chunks:
        result = request_transcription(chunk.wav, model, deadline)
        texts.append(postprocess_transcript(result, chunk.speech_ranges))
    return " ".join(text for text in texts if text)


def request_transcription(audio_bytes: bytes, model: str, deadline: float) -> dict:
    payload = {"model": model, "input_audio": {"data": base64.b64encode(audio_bytes).decode("ascii"), "format": "wav"}}
    if "whisper" in model.casefold():
        payload.update(language="pl", temperature=0.0, response_format="verbose_json",
                       timestamp_granularities=["word", "segment"])
    base_url = (os.environ.get("OPENROUTER_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    timeout = min(TIMEOUT_S, deadline - time.monotonic())
    if timeout <= 0:
        raise TranscriptionError("timeout")
    try:
        with httpx.Client(timeout=timeout, transport=transport) as client:
            save_debug_audio(audio_bytes, "wav")
            response = client.post(f"{base_url}/audio/transcriptions", json=payload, headers={
                "Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}", "X-OpenRouter-Title": "Glosowy agent HackYeah"})
    except httpx.TimeoutException:
        raise TranscriptionError("timeout") from None
    except httpx.RequestError:
        raise TranscriptionError("provider_error") from None
    if response.status_code == 415:
        raise TranscriptionError("unsupported_format")
    if response.status_code >= 400:
        raise TranscriptionError("provider_error")
    try:
        result = response.json()
    except ValueError:
        raise TranscriptionError("provider_error") from None
    if not isinstance(result, dict) or "error" in result or not isinstance(result.get("text"), str):
        raise TranscriptionError("provider_error")
    return result
