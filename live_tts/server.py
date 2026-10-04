"""FastAPI TTS, matching live_stt's factory and lifespan conventions."""
import asyncio
import time
import uuid
from contextlib import asynccontextmanager

import anyio
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

from config import Settings
from streaming import ManagedStreamResponse, Metrics, pcm_to_wav
from text_normalizer import normalize_text


class SynthesisRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20000)


def create_app(settings=None, engine_factory=None):
    cfg = settings or Settings.from_env()
    if engine_factory is None:
        from backends import engine_class
        engine_factory = engine_class(cfg.backend)

    @asynccontextmanager
    async def lifespan(app):
        app.state.engine = engine_factory(cfg)
        app.state.busy = False
        try:
            await app.state.engine.start()
            yield
        finally:
            await app.state.engine.close()

    app = FastAPI(title="Piper streaming TTS", lifespan=lifespan)

    @app.middleware("http")
    async def received(request, call_next):
        request.state.received_at = time.time()
        request.state.started = time.perf_counter()
        return await call_next(request)

    @app.get("/health")
    @app.get("/ready")
    async def health():
        engine = app.state.engine
        return {"status": "ok" if engine.ready else "unavailable", "ready": engine.ready,
                "backend": cfg.backend, "voice": cfg.local_voice if cfg.backend == "local" else cfg.openrouter_voice,
                "model": cfg.local_voice if cfg.backend == "local" else cfg.openrouter_model,
                "parameters": cfg.parameters if cfg.backend == "local" else {},
                "sample_rate": engine.sample_rate, "encoding": engine.encoding,
                "model_load_time": engine.model_load_time, "model_load_count": engine.load_count,
                "busy": app.state.busy, "normalize_text": cfg.normalize_text}

    async def prepare(body, request):
        text = body.text.strip()
        if not text or not any(c.isalnum() for c in text):
            raise HTTPException(422, "Text must contain letters or numbers")
        if len(text) > cfg.max_text_chars:
            raise HTTPException(422, f"Text limit: {cfg.max_text_chars} characters")
        if not app.state.engine.ready:
            raise HTTPException(503, "Backend not ready")
        # One model, one active request. Reject overload instead of an unbounded queue.
        if app.state.busy:
            raise HTTPException(429, "TTS busy; retry when the active request ends", headers={"Retry-After": "1"})
        if cfg.normalize_text:
            text = normalize_text(text)
        app.state.busy = True
        metrics = Metrics(uuid.uuid4().hex, request.state.received_at,
                          request.state.started, len(body.text))
        iterator = metrics.track(app.state.engine.synthesize_stream(text))
        async def cleanup():
            try:
                await iterator.aclose()
            finally:
                app.state.busy = False
        try:
            first = await asyncio.wait_for(anext(iterator), cfg.request_timeout_seconds)
        except BaseException as exc:
            with anyio.CancelScope(shield=True):
                await cleanup()
            if isinstance(exc, asyncio.CancelledError):
                raise
            raise HTTPException(502, "Synthesis failed before first audio; check backend configuration") from None
        headers = {"X-Request-Id": metrics.request_id, "X-Audio-Encoding": app.state.engine.encoding,
                   "Cache-Control": "no-store", "X-Accel-Buffering": "no",
                   "X-First-Audio-Latency-Seconds": f"{metrics.first_audio_chunk_latency:.6f}"}
        if app.state.engine.sample_rate:
            headers.update({"X-Sample-Rate": str(app.state.engine.sample_rate), "X-Channels": "1"})
        return iterator, first, metrics, headers, cleanup

    @app.post("/synthesize/stream")
    @app.post("/v1/synthesize/stream")
    async def stream(body: SynthesisRequest, request: Request):
        iterator, first, metrics, headers, cleanup = await prepare(body, request)
        async def chunks():
            yield first
            async for chunk in iterator:
                yield chunk
        return ManagedStreamResponse(chunks(), media_type=app.state.engine.media_type,
                                     headers=headers, cleanup=cleanup)

    @app.post("/synthesize")
    @app.post("/v1/synthesize")
    async def synthesize(body: SynthesisRequest, request: Request):
        iterator, first, metrics, headers, cleanup = await prepare(body, request)
        try:
            chunks = [first]
            async for chunk in iterator:
                chunks.append(chunk)
            audio = b"".join(chunks)
            if cfg.backend == "local":
                audio = pcm_to_wav(audio, app.state.engine.sample_rate)
            headers["X-Generation-Time-Seconds"] = f"{metrics.total_generation_time:.6f}"
            return Response(audio, media_type="audio/wav" if cfg.backend == "local" else "audio/mpeg", headers=headers)
        except Exception:
            raise HTTPException(502, "Synthesis failed") from None
        finally:
            with anyio.CancelScope(shield=True):
                await cleanup()

    return app
