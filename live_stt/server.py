"""Audio -> WebSocket -> partial/final, równolegle w obie strony."""

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager, suppress

import webrtcvad
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from config import SAMPLE_RATE, Settings
from streaming import DecodeMailbox, Segmenter, StreamError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)


def create_app(settings: Settings | None = None, engine_factory=None, vad_factory=None):
    cfg = settings or Settings.from_env()
    if engine_factory is None:
        from backends import engine_class
        engine_factory = engine_class(cfg.asr_backend)
    if vad_factory is None:
        vad_factory = lambda: webrtcvad.Vad(cfg.vad_mode)

    @asynccontextmanager
    async def lifespan(app):
        app.state.engine = engine_factory(cfg)
        app.state.connections = 0
        try:
            await app.state.engine.start()
            yield
        finally:
            await app.state.engine.close()

    app = FastAPI(title="Parakeet bidirectional WebSocket ASR", lifespan=lifespan)

    @app.get("/health")
    @app.get("/ready")
    async def health():
        return {"ready": app.state.engine.ready, "model": cfg.active_model,
                "backend": cfg.asr_backend,
                "device": cfg.device if cfg.asr_backend == "local" else "remote",
                "connections": app.state.connections}

    @app.websocket("/ws")
    @app.websocket("/v1/transcribe")
    async def transcribe(ws: WebSocket):
        await ws.accept()

        async def send(payload):
            await asyncio.wait_for(ws.send_json(payload), timeout=cfg.send_timeout_s)

        if app.state.connections >= cfg.max_connections:
            await send({"type": "error", "message": "Osiągnięto limit połączeń."})
            await ws.close(code=1013)
            return
        app.state.connections += 1
        mailbox = DecodeMailbox(cfg.max_pending_segments)
        vad = vad_factory()
        segmenter = Segmenter(cfg, lambda frame: vad.is_speech(frame, SAMPLE_RATE), mailbox.put)
        tasks = []

        async def receive_audio():
            while True:
                try:
                    message = await asyncio.wait_for(ws.receive(), cfg.idle_timeout_s)
                except asyncio.TimeoutError:
                    raise StreamError("Brak danych. Przesyłaj także ciszę albo wyślij {\"type\":\"end\"}.")
                if message["type"] == "websocket.disconnect":
                    raise WebSocketDisconnect(message.get("code", 1000))
                if message.get("bytes") is not None:
                    data = message["bytes"]
                    if len(data) > cfg.max_message_bytes:
                        raise StreamError(f"Za duża wiadomość audio. Limit: {cfg.max_message_bytes} bajtów.", 1009)
                    segmenter.feed(data)
                    # Oddaj sterowanie także przy bardzo szybko nadchodzących wiadomościach.
                    await asyncio.sleep(0)
                elif message.get("text") is not None:
                    raw = message["text"]
                    if len(raw) > 1024:
                        raise StreamError("Za duża wiadomość sterująca.", 1009)
                    try:
                        command = json.loads(raw)
                    except json.JSONDecodeError:
                        raise StreamError("Wiadomość tekstowa musi być JSON-em.")
                    if not isinstance(command, dict) or command.get("type") not in {"flush", "end"}:
                        raise StreamError("Dozwolone komunikaty: {\"type\":\"flush\"}, {\"type\":\"end\"}.")
                    segmenter.finish(command["type"])
                    if command["type"] == "end":
                        mailbox.close()
                        return

        async def decode_and_send():
            last_segment = None
            revision = 0
            while (job := await mailbox.get()) is not None:
                result = await app.state.engine.transcribe(job)
                if job.segment_id != last_segment:
                    last_segment = job.segment_id
                    revision = 0
                revision += 1
                response = {"type": "final" if job.final else "partial",
                            "segment_id": job.segment_id, "revision": revision,
                            "start_ms": round(job.start_sample * 1000 / SAMPLE_RATE),
                            "end_ms": round(job.end_sample * 1000 / SAMPLE_RATE), **result}
                if job.final:
                    response["reason"] = job.reason
                # Nawet pusty final zamyka segment i usuwa ewentualny poprzedni partial.
                await send(response)

        try:
            await send({"type": "ready", "model": cfg.active_model, "sample_rate": SAMPLE_RATE,
                        "backend": cfg.asr_backend, "partials": cfg.partials_enabled,
                        "channels": 1, "encoding": "pcm_s16le", "partial_interval_ms": cfg.partial_interval_ms,
                        "word_timestamps": cfg.word_timestamps, "time_unit": "ms"})
            receiver = asyncio.create_task(receive_audio())
            decoder = asyncio.create_task(decode_and_send())
            tasks = [receiver, decoder]
            done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
            for task in done:
                task.result()
            # Poprawne end zamyka wejście, ale nadal czekamy na wszystkie wyniki final.
            await receiver
            await decoder
            await send({"type": "done"})
            await ws.close(code=1000)
        except WebSocketDisconnect:
            pass
        except Exception as exc:
            # Najpierw zatrzymujemy producenta wyników, aby wiadomości się nie przeplatały.
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            if isinstance(exc, StreamError):
                message, code = str(exc), exc.code
            else:
                log.exception("Błąd obsługi strumienia")
                message, code = "Błąd transkrypcji. Sprawdź logi serwera.", 1011
            with suppress(Exception):
                await send({"type": "error", "message": message})
                await ws.close(code=code)
        finally:
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            app.state.connections -= 1

    return app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(create_app(), host=os.getenv("HOST", "0.0.0.0"),
                port=int(os.getenv("PORT", "7000")), ws="websockets",
                ws_max_size=128_000, ws_max_queue=16)
