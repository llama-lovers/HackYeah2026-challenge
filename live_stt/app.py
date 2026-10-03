import asyncio
import base64
import io
import json
import math
import os
import wave
from contextlib import asynccontextmanager, suppress

import httpx
from fastapi import FastAPI, WebSocket, WebSocketDisconnect


API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
MODEL = os.getenv(
    "OPENROUTER_MODEL",
    "nvidia/parakeet-tdt-0.6b-v3",
).strip()

API_URL = "https://openrouter.ai/api/v1/audio/transcriptions"

SAMPLE_RATE = 16000
BYTES_PER_SECOND = SAMPLE_RATE * 2  # PCM16, mono

CHUNK_SECONDS = float(os.getenv("CHUNK_SECONDS", "5"))
MAX_PENDING_CHUNKS = int(os.getenv("MAX_PENDING_CHUNKS", "6"))
REQUEST_TIMEOUT = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "90"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not API_KEY or API_KEY == "TU_WKLEJ_KLUCZ_OPENROUTER":
        raise RuntimeError("Wpisz OPENROUTER_API_KEY w config.env.")

    if not MODEL:
        raise RuntimeError("OPENROUTER_MODEL nie może być pusty.")

    if not math.isfinite(CHUNK_SECONDS) or not 1 <= CHUNK_SECONDS <= 30:
        raise RuntimeError("CHUNK_SECONDS musi być między 1 a 30.")

    if not 1 <= MAX_PENDING_CHUNKS <= 20:
        raise RuntimeError("MAX_PENDING_CHUNKS musi być między 1 a 20.")

    if not math.isfinite(REQUEST_TIMEOUT) or not 1 <= REQUEST_TIMEOUT <= 120:
        raise RuntimeError("REQUEST_TIMEOUT_SECONDS musi być między 1 a 120.")

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(REQUEST_TIMEOUT, connect=15),
        headers={"Authorization": f"Bearer {API_KEY}"},
    ) as client:
        app.state.http = client
        yield


app = FastAPI(lifespan=lifespan)


def pcm_to_wav(pcm: bytes) -> bytes:
    output = io.BytesIO()

    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(SAMPLE_RATE)
        wav.writeframes(pcm)

    return output.getvalue()


async def transcribe(pcm: bytes) -> str:
    payload = {
        "model": MODEL,
        "input_audio": {
            "data": base64.b64encode(pcm_to_wav(pcm)).decode("ascii"),
            "format": "wav",
        },
    }

    try:
        response = await app.state.http.post(API_URL, json=payload)
    except httpx.RequestError:
        raise RuntimeError(
            "Błąd sieci lub timeout OpenRouter. "
            "Żądanie nie zostało automatycznie ponowione."
        ) from None

    try:
        result = response.json()
    except ValueError:
        raise RuntimeError(
            f"OpenRouter HTTP {response.status_code}: odpowiedź nie jest JSON."
        ) from None

    if not response.is_success or (
        isinstance(result, dict) and "error" in result
    ):
        error = result.get("error", {}) if isinstance(result, dict) else {}
        message = (
            error.get("message", str(error))
            if isinstance(error, dict)
            else str(error)
        )
        message = str(message).replace(API_KEY, "[UKRYTY KLUCZ]")[:1000]

        raise RuntimeError(
            f"OpenRouter HTTP {response.status_code}: {message}"
        )

    if not isinstance(result, dict) or not isinstance(result.get("text"), str):
        raise RuntimeError("OpenRouter zwrócił odpowiedź bez pola text.")

    return result["text"]


@app.get("/health")
async def health():
    # Sprawdza działanie serwera, nie ważność klucza ani saldo OpenRouter.
    return {"status": "ok", "model": MODEL}


@app.websocket("/v1/transcribe")
async def websocket_transcribe(ws: WebSocket):
    await ws.accept()

    # Zaokrąglenie do całkowitej liczby próbek PCM16.
    chunk_bytes = int(CHUNK_SECONDS * SAMPLE_RATE) * 2
    queue = asyncio.Queue(maxsize=MAX_PENDING_CHUNKS)
    tasks = []

    async def send(payload):
        await asyncio.wait_for(ws.send_json(payload), timeout=15)

    async def receive_audio():
        buffer = bytearray()

        def enqueue(pcm):
            try:
                queue.put_nowait(pcm)
            except asyncio.QueueFull:
                raise RuntimeError(
                    "OpenRouter nie nadąża. Przekroczono limit kolejki audio."
                ) from None

        while True:
            message = await asyncio.wait_for(ws.receive(), timeout=60)

            if message["type"] == "websocket.disconnect":
                raise WebSocketDisconnect(message.get("code", 1000))

            audio = message.get("bytes")

            if audio is not None:
                if len(audio) > 64000:
                    raise ValueError("Wiadomość audio przekracza 64000 bajtów.")

                buffer.extend(audio)

                while len(buffer) >= chunk_bytes:
                    enqueue(bytes(buffer[:chunk_bytes]))
                    del buffer[:chunk_bytes]

                continue

            control = json.loads(message.get("text") or "{}")

            if not isinstance(control, dict) or control.get("type") != "end":
                raise ValueError(
                    'Wyślij binarne PCM16 albo JSON {"type": "end"}.'
                )

            if len(buffer) % 2:
                raise ValueError("Niepełna próbka PCM16.")

            if buffer:
                enqueue(bytes(buffer))

            # Znacznik końca za wszystkimi oczekującymi fragmentami.
            await queue.put(None)
            return

    async def return_transcripts():
        segment_id = 0
        processed_bytes = 0

        while True:
            pcm = await queue.get()

            if pcm is None:
                await send({"type": "done"})
                return

            text = await transcribe(pcm)
            segment_id += 1

            start_ms = processed_bytes * 1000 / BYTES_PER_SECOND
            processed_bytes += len(pcm)
            end_ms = processed_bytes * 1000 / BYTES_PER_SECOND

            await send({
                "type": "final",
                "segment_id": segment_id,
                "revision": 1,
                "start_ms": start_ms,
                "end_ms": end_ms,
                "text": text,
            })

    try:
        await send({
            "type": "ready",
            "model": MODEL,
            "sample_rate": SAMPLE_RATE,
            "channels": 1,
            "encoding": "pcm_s16le",
        })

        # Odbiór audio trwa również podczas oczekiwania na OpenRouter.
        tasks = [
            asyncio.create_task(receive_audio()),
            asyncio.create_task(return_transcripts()),
        ]
        await asyncio.gather(*tasks)

    except WebSocketDisconnect:
        pass

    except Exception as exc:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

        message = str(exc).replace(API_KEY, "[UKRYTY KLUCZ]")
        if not message:
            message = "Przekroczono czas oczekiwania."

        with suppress(Exception):
            await send({"type": "error", "message": message[:1000]})

    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)

        with suppress(Exception):
            await asyncio.wait_for(ws.close(), timeout=5)
