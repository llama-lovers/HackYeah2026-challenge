"""One-shot OpenRouter transcription behind stt.transcribe; never logs or persists audio or text.

Request shape follows the live_stt OpenRouter engine (JSON base64 input_audio), but runs
in-process so the demo needs no extra container. The model is switchable via STT_MODEL.
"""

import base64
import os

import httpx

from app.stt import TranscriptionError

DEFAULT_MODEL = "openai/whisper-large-v3-turbo"
DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
TIMEOUT_S = 10.0
FORMATS = {"audio/webm": "webm", "audio/ogg": "ogg", "audio/wav": "wav", "audio/wave": "wav", "audio/x-wav": "wav"}
transport: httpx.BaseTransport | None = None  # tests inject httpx.MockTransport


def transcribe_whisper(audio_bytes: bytes, mime: str) -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        raise TranscriptionError("provider_error")
    fmt = FORMATS.get(mime.split(";", 1)[0].strip().casefold())
    if fmt is None:
        raise TranscriptionError("unsupported_format")
    model = os.environ.get("STT_MODEL") or DEFAULT_MODEL
    payload = {"model": model, "input_audio": {"data": base64.b64encode(audio_bytes).decode("ascii"), "format": fmt}}
    # Pinning Polish stops Whisper guessing Russian/Ukrainian on short commands; other models (Parakeet) auto-detect.
    if "whisper" in model.casefold():
        payload["language"] = "pl"
    base_url = (os.environ.get("OPENROUTER_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")
    try:
        with httpx.Client(timeout=TIMEOUT_S, transport=transport) as client:
            response = client.post(f"{base_url}/audio/transcriptions", json=payload, headers={
                "Authorization": f"Bearer {key}", "X-OpenRouter-Title": "Glosowy agent HackYeah"})
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
    return result["text"].strip()
