"""Incremental delivery and per-request telemetry, without buffering the whole audio."""
import io
import json
import logging
import time
import wave
from dataclasses import dataclass, field

import anyio
from starlette.responses import StreamingResponse

log = logging.getLogger(__name__)


def pcm_to_wav(pcm, sample_rate):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(pcm)
    return output.getvalue()


@dataclass
class Metrics:
    request_id: str
    received_at: float
    started: float
    text_length: int
    first_audio_chunk_latency: float | None = None
    total_generation_time: float = 0.0
    chunks: int = 0
    complete: bool = False
    finished_at: float | None = None

    async def track(self, source):
        try:
            while True:
                start = time.perf_counter()
                try:
                    chunk = await anext(source)
                except StopAsyncIteration:
                    self.total_generation_time += time.perf_counter() - start
                    self.complete = True
                    self.finished_at = time.time()
                    break
                self.total_generation_time += time.perf_counter() - start
                if not chunk:
                    continue
                self.chunks += 1
                if self.first_audio_chunk_latency is None:
                    self.first_audio_chunk_latency = time.perf_counter() - self.started
                    log.info("tts_first_chunk %s", json.dumps({
                        "request_id": self.request_id, "received_at": self.received_at,
                        "text_length": self.text_length,
                        "first_audio_chunk_latency": self.first_audio_chunk_latency}))
                yield chunk
        finally:
            await source.aclose()
            log.info("tts_complete %s", json.dumps({
                "request_id": self.request_id, "received_at": self.received_at,
                "finished_at": self.finished_at, "text_length": self.text_length,
                "first_audio_chunk_latency": self.first_audio_chunk_latency,
                "total_generation_time": self.total_generation_time,
                "request_elapsed": time.perf_counter() - self.started,
                "chunks": self.chunks, "complete": self.complete}))


class ManagedStreamResponse(StreamingResponse):
    """Close the Piper iterator even if the client disconnects during a send."""
    def __init__(self, *args, cleanup, **kwargs):
        self.cleanup = cleanup
        super().__init__(*args, **kwargs)

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            with anyio.CancelScope(shield=True):
                await self.cleanup()
