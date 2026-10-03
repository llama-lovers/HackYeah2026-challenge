"""API Python 3.14 komunikuje się z izolowanym procesem NeMo Python 3.13."""
import asyncio
import base64
from contextlib import suppress
from dataclasses import asdict
import json
import os
from pathlib import Path


class LocalWorkerEngine:
    def __init__(self, settings, *, python=None, script=None):
        self.cfg = settings
        root = Path(__file__).resolve().parent
        self.python = python or os.getenv("LOCAL_PYTHON") or str(root / "local_runtime/.venv/bin/python")
        self.script = str(script or root / "local_worker.py")
        self.process = None
        self.ready = False
        self.lock = asyncio.Lock()

    async def _exchange(self, payload):
        if self.process is None or self.process.returncode is not None:
            raise RuntimeError("Proces lokalnego modelu nie działa")
        self.process.stdin.write((json.dumps(payload) + "\n").encode())
        await self.process.stdin.drain()
        line = await self.process.stdout.readline()
        if not line:
            self.ready = False
            raise RuntimeError("Proces lokalnego modelu zakończył pracę. Sprawdź logi.")
        result = json.loads(line)
        if result.get("type") == "error":
            raise RuntimeError(result.get("message", "Błąd lokalnego modelu"))
        return result

    async def start(self):
        self.process = await asyncio.create_subprocess_exec(
            self.python, "-u", self.script,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            limit=2_000_000,
        )
        settings = asdict(self.cfg)
        settings.pop("openrouter_api_key", None)
        try:
            result = await asyncio.wait_for(
                self._exchange({"type": "start", "settings": settings}), timeout=900,
            )
            if result.get("type") != "ready":
                raise RuntimeError("Nieprawidłowa odpowiedź procesu modelu")
            self.ready = True
        except BaseException:
            await self.close()
            raise

    async def transcribe(self, job):
        payload = {
            "type": "transcribe",
            "job": {
                "segment_id": job.segment_id, "start_sample": job.start_sample,
                "end_sample": job.end_sample, "final": job.final, "reason": job.reason,
                "pcm": base64.b64encode(job.pcm).decode("ascii"),
            },
        }
        async with self.lock:
            task = asyncio.create_task(self._exchange(payload))
            try:
                result = await asyncio.shield(task)
            except asyncio.CancelledError:
                # Odbierz odpowiedź anulowanego klienta przed następnym żądaniem.
                # Dzięki temu wynik nie trafi do innej sesji.
                with suppress(Exception):
                    await task
                raise
            if result.get("type") != "result":
                raise RuntimeError("Nieprawidłowy wynik procesu modelu")
            return result["result"]

    async def close(self):
        self.ready = False
        if self.process is None:
            return
        if self.process.stdin:
            self.process.stdin.close()
        try:
            await asyncio.wait_for(self.process.wait(), timeout=10)
        except asyncio.TimeoutError:
            with suppress(ProcessLookupError):
                self.process.kill()
            await self.process.wait()
        self.process = None
