"""Verified OpenRouter Audio Speech API. MP3 avoids guessing provider PCM metadata."""
import httpx

API_URL = "https://openrouter.ai/api/v1/audio/speech"


class OpenRouterEngine:
    media_type = "audio/mpeg"
    encoding = "mp3"
    sample_rate = None  # MP3 bitstream contains its native sample rate.
    load_count = 0
    model_load_time = 0.0

    def __init__(self, settings):
        self.cfg = settings
        self.ready = False
        self.client = None

    async def start(self):
        if not all((self.cfg.openrouter_api_key.strip(), self.cfg.openrouter_model.strip(),
                    self.cfg.openrouter_voice.strip())):
            raise RuntimeError("Set TTS_OPENROUTER_API_KEY, TTS_OPENROUTER_MODEL and TTS_OPENROUTER_VOICE")
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(self.cfg.request_timeout_seconds, connect=15),
            headers={"Authorization": f"Bearer {self.cfg.openrouter_api_key}"},
        )
        self.ready = True  # Configuration only; account/model access checked on request.

    async def synthesize_stream(self, text):
        try:
            async with self.client.stream("POST", API_URL, json={
                "model": self.cfg.openrouter_model, "voice": self.cfg.openrouter_voice,
                "input": text, "response_format": "mp3",
            }) as response:
                if response.status_code != 200:
                    raise RuntimeError(f"OpenRouter HTTP {response.status_code}; check account/model/voice")
                if "audio/" not in response.headers.get("content-type", ""):
                    raise RuntimeError("OpenRouter returned non-audio content")
                async for chunk in response.aiter_bytes():
                    if chunk:
                        yield chunk
        except httpx.RequestError:
            raise RuntimeError("OpenRouter network error or timeout; no automatic retry") from None

    async def close(self):
        self.ready = False
        if self.client:
            await self.client.aclose()
