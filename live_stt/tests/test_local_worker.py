import asyncio
from pathlib import Path
import shutil
import sys

import pytest

from config import Settings
from local_engine import LocalWorkerEngine
from streaming import DecodeJob


def fake_model_worker(tmp_path):
    root = Path(__file__).resolve().parents[1]
    for filename in ('local_worker.py', 'config.py', 'streaming.py'):
        shutil.copyfile(root / filename, tmp_path / filename)
    (tmp_path / 'asr.py').write_text('''import asyncio, os
class ParakeetEngine:
    def __init__(self, settings):
        assert settings.openrouter_api_key == ""
    async def start(self):
        print("Model log on stdout", flush=True)
        os.write(1, b"Native model log\\n")
    async def transcribe(self, job):
        await asyncio.sleep(0.08)
        if job.pcm[0] == 9:
            raise RuntimeError("controlled model failure")
        print("Inference log", flush=True)
        return {"text": str(job.pcm[0]), "inference_ms": 80}
    async def close(self):
        pass
''')
    return LocalWorkerEngine(
        Settings(openrouter_api_key='never-send-to-worker'),
        python=sys.executable, script=tmp_path / 'local_worker.py',
    )


def job(value):
    return DecodeJob(1, 0, 320, bytes([value, 0]) * 320, final=True)


def test_worker_logs_do_not_corrupt_protocol_and_errors_are_propagated(tmp_path):
    async def check():
        engine = fake_model_worker(tmp_path)
        try:
            await engine.start()
            assert engine.ready
            assert (await engine.transcribe(job(3)))['text'] == '3'
            with pytest.raises(RuntimeError, match='controlled model failure'):
                await engine.transcribe(job(9))
            assert (await engine.transcribe(job(4)))['text'] == '4'
        finally:
            await engine.close()
        assert not engine.ready and engine.process is None
    asyncio.run(check())


def test_cancelling_one_client_does_not_send_its_result_to_another(tmp_path):
    async def check():
        engine = fake_model_worker(tmp_path)
        try:
            await engine.start()
            first = asyncio.create_task(engine.transcribe(job(1)))
            await asyncio.sleep(0.03)
            first.cancel()
            second = asyncio.create_task(engine.transcribe(job(2)))
            with pytest.raises(asyncio.CancelledError):
                await first
            assert (await second)['text'] == '2'
        finally:
            await engine.close()
    asyncio.run(check())
