"""One ONNX model per process. Piper yields one PCM chunk per sentence."""
import asyncio
import logging
import time
import anyio

log = logging.getLogger(__name__)


class LocalEngine:
    media_type = "audio/pcm"
    encoding = "pcm_s16le"

    def __init__(self, settings):
        self.cfg = settings
        self.ready = False
        self.voice = None
        self.sample_rate = None
        self.load_count = 0
        self.model_load_time = 0.0
        self.lock = asyncio.Lock()

    async def start(self):
        if self.ready:
            return
        path = self.cfg.model_path
        if not path.is_file() or not path.with_suffix(".onnx.json").is_file():
            raise RuntimeError(f"Missing voice {path.name}; run python scripts/download_model.py")
        from piper import PiperVoice, SynthesisConfig
        started = time.perf_counter()
        self.voice = await asyncio.to_thread(PiperVoice.load, str(path), use_cuda=False)
        self.syn_config = SynthesisConfig(**self.cfg.parameters)
        self.sample_rate = self.voice.config.sample_rate
        self.load_count += 1
        self.model_load_time = time.perf_counter() - started
        self.ready = True
        log.info("model_loaded voice=%s model_load_time=%.6f load_count=%d parameters=%s",
                 self.cfg.local_voice, self.model_load_time, self.load_count, self.cfg.parameters)

    async def synthesize_stream(self, text):
        if not self.ready:
            raise RuntimeError("Piper is not ready")
        async with self.lock:
            iterator = iter(self.voice.synthesize(text, syn_config=self.syn_config))
            def step():
                chunk = next(iterator, None)
                if chunk is None:
                    return None
                # Explicit little endian, mono PCM16, no resampling.
                return chunk.audio_int16_array.astype("<i2", copy=False).tobytes()
            try:
                while True:
                    # Never leave ONNX running concurrently after client cancellation.
                    task = asyncio.create_task(asyncio.to_thread(step))
                    try:
                        data = await asyncio.shield(task)
                    except asyncio.CancelledError:
                        # Starlette uses level-triggered AnyIO cancellation: shield
                        # this wait too, or a second cancellation closes a running generator.
                        with anyio.CancelScope(shield=True):
                            await asyncio.shield(task)
                        raise
                    if data is None:
                        break
                    if data:
                        yield data
            finally:
                iterator.close()

    async def close(self):
        async with self.lock:
            self.ready = False
            self.voice = None
