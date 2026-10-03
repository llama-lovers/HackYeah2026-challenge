import asyncio
import base64
import io
import logging
import time
import wave

import httpx

from config import SAMPLE_RATE
from streaming import StreamError

log = logging.getLogger(__name__)
API_URL = "https://openrouter.ai/api/v1/audio/transcriptions"


class OpenRouterEngine:
    def __init__(self, settings):
        self.cfg = settings
        self.client = None
        self.ready = False
        self.semaphore = asyncio.Semaphore(settings.max_connections)

    async def start(self):
        key = self.cfg.openrouter_api_key.strip()
        if not key or key == "TU_WKLEJ_KLUCZ_OPENROUTER":
            raise RuntimeError("Wpisz OPENROUTER_API_KEY w config.env")
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.cfg.request_timeout_seconds, connect=15),
            headers={"Authorization": f"Bearer {key}"},
            limits=httpx.Limits(max_connections=self.cfg.max_connections),
        )
        self.ready = True
        log.info("Backend OpenRouter gotowy: %s (klucz będzie sprawdzony przy transkrypcji)",
                 self.cfg.openrouter_model)

    async def transcribe(self, job):
        # Każde żądanie przepisuje cały aktualny bufor segmentu.
        # To serwer WS nadaje wynikowi status partial albo final.
        buffer = io.BytesIO()
        with wave.open(buffer, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(SAMPLE_RATE)
            wav.writeframes(job.pcm)
        payload = {
            "model": self.cfg.openrouter_model,
            "input_audio": {
                "data": base64.b64encode(buffer.getvalue()).decode("ascii"),
                "format": "wav",
            },
        }
        started = time.perf_counter()
        try:
            async with self.semaphore:
                response = await self.client.post(API_URL, json=payload)
        except httpx.RequestError:
            raise StreamError("Błąd sieci lub timeout OpenRouter; bez automatycznego ponawiania.", 1011) from None
        try:
            result = response.json()
        except ValueError:
            raise StreamError(f"OpenRouter HTTP {response.status_code}: odpowiedź nie jest JSON.", 1011) from None
        if not response.is_success or (isinstance(result, dict) and "error" in result):
            # Nie przekazujemy surowego błędu upstream (może zawierać dane żądania).
            hints = {401: "Sprawdź klucz API.", 402: "Sprawdź saldo konta.",
                     404: "Sprawdź OPENROUTER_MODEL.", 429: "Limit żądań usługi."}
            raise StreamError(f"OpenRouter HTTP {response.status_code}. "
                              + hints.get(response.status_code, "Sprawdź konfigurację i dostępność modelu."), 1011)
        if not isinstance(result, dict) or not isinstance(result.get("text"), str):
            raise StreamError("OpenRouter: brak pola text w odpowiedzi.", 1011)
        return {"text": result["text"].strip(),
                "inference_ms": round((time.perf_counter() - started) * 1000, 1)}

    async def close(self):
        self.ready = False
        if self.client is not None:
            await self.client.aclose()
