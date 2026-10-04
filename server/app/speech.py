"""Bounded local TTS forwarding; no text retention or cloud credentials."""
import io
import wave

import httpx
from pydantic import Field, field_validator

from app.schemas import StrictModel

MAX_AUDIO_BYTES = 8 * 1024 * 1024


class SpeechRequest(StrictModel):
    text: str = Field(min_length=1, max_length=4000)

    @field_validator("text")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("empty_speech")
        return value


async def synthesize(client: httpx.AsyncClient, text: str) -> bytes:
    async with client.stream("POST", "synthesize", json={"text": text}) as response:
        if response.status_code != 200 or response.headers.get("content-type", "").split(";")[0].strip() != "audio/wav":
            raise ValueError("tts_unavailable")
        chunks, size = [], 0
        async for chunk in response.aiter_bytes():
            size += len(chunk)
            if size > MAX_AUDIO_BYTES:
                raise ValueError("tts_unavailable")
            chunks.append(chunk)
    audio = b"".join(chunks)
    try:
        with wave.open(io.BytesIO(audio), "rb") as wav:
            if wav.getnframes() == 0 or wav.getnchannels() != 1 or wav.getsampwidth() != 2:
                raise ValueError("tts_unavailable")
    except (wave.Error, EOFError) as exc:
        raise ValueError("tts_unavailable") from exc
    return audio
