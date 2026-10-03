"""Jeden model i jeden wątek obliczeniowy współdzielony przez połączenia."""

import asyncio
import logging
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np

from config import SAMPLE_RATE, Settings
from streaming import DecodeJob

log = logging.getLogger(__name__)


class ParakeetEngine:
    def __init__(self, settings: Settings):
        self.cfg = settings
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="parakeet")
        self.model = None
        self.ready = False

    async def start(self):
        await asyncio.get_running_loop().run_in_executor(self.executor, self._load)
        self.ready = True

    def _load(self):
        import torch
        import nemo.collections.asr as nemo_asr
        from omegaconf import OmegaConf, open_dict

        if self.cfg.device.startswith("cuda") and not torch.cuda.is_available():
            raise RuntimeError("CUDA niedostępna. Sprawdź sterownik, PyTorch i przekazanie GPU do Docker.")
        self.torch = torch
        device = torch.device(self.cfg.device)
        if device.type == "cuda":
            torch.cuda.set_device(device.index if device.index is not None else 0)
        log.info("Ładowanie %s na %s", self.cfg.model_name, device)
        self.model = nemo_asr.models.ASRModel.from_pretrained(
            model_name=self.cfg.model_name, map_location=device
        )
        self.model.to(device)
        self.model.eval()
        decoding = OmegaConf.create(OmegaConf.to_container(self.model.cfg.decoding, resolve=True))
        with open_dict(decoding):
            decoding.strategy = "greedy_batch"
            if "greedy" not in decoding:
                decoding.greedy = {}
            # Zmienne długości buforów; bez kompilacji CUDA graphs przy każdym partial.
            decoding.greedy.use_cuda_graph_decoder = False
        self.model.change_decoding_strategy(decoding, verbose=False)
        if int(self.model.cfg.preprocessor.sample_rate) != SAMPLE_RATE:
            raise RuntimeError("Model musi przyjmować audio 16 kHz")
        # Pierwsze wywołanie inicjalizuje ścieżkę inferencji przed gotowością API.
        self._transcribe(DecodeJob(0, 0, SAMPLE_RATE, b"\0" * (SAMPLE_RATE * 2)))
        log.info("Model gotowy")

    async def transcribe(self, job: DecodeJob):
        # Anulowanie klienta nie umożliwia równoległego wejścia do modelu:
        # także już uruchomione zadanie pozostaje w jednowątkowym executorze.
        return await asyncio.get_running_loop().run_in_executor(self.executor, self._transcribe, job)

    def _transcribe(self, job: DecodeJob):
        started = time.perf_counter()
        samples = np.frombuffer(job.pcm, dtype="<i2").astype(np.float32) / 32768.0
        kwargs = dict(audio=[samples], batch_size=1, num_workers=0,
                      return_hypotheses=True, verbose=False)
        if self.cfg.word_timestamps:
            kwargs["timestamps"] = True
        with self.torch.inference_mode():
            output = self.model.transcribe(**kwargs)
        # NeMo RNNT w zależności od wersji może zwrócić listę albo (best, all).
        if isinstance(output, tuple):
            output = output[0]
        hypothesis = output[0]
        result = {"text": str(getattr(hypothesis, "text", hypothesis)).strip(),
                  "inference_ms": round((time.perf_counter() - started) * 1000, 1)}
        if self.cfg.word_timestamps:
            base_ms = job.start_sample * 1000 / SAMPLE_RATE
            end_ms = job.end_sample * 1000 / SAMPLE_RATE
            stamps = getattr(hypothesis, "timestamp", {}) or {}
            words = []
            for stamp in stamps.get("word", []):
                start = min(end_ms, max(base_ms, base_ms + float(stamp["start"]) * 1000))
                end = min(end_ms, max(start, base_ms + float(stamp["end"]) * 1000))
                words.append({"word": stamp["word"], "start": round(start), "end": round(end)})
            result["words"] = words
        return result

    async def close(self):
        self.ready = False
        await asyncio.to_thread(self.executor.shutdown, wait=True, cancel_futures=True)
        self.model = None
