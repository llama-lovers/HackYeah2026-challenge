import asyncio
import base64
import io
import json
import sys
import wave
from dataclasses import replace

import httpx
import pytest
from fastapi.testclient import TestClient

from backends import engine_class
from config import Settings, FRAME_BYTES
from openrouter_engine import OpenRouterEngine
from run import compose_command, read_config
from server import create_app
from streaming import DecodeJob, StreamError
from test_server import FakeVAD, FakeEngine, speech, until


def test_remote_factory_does_not_import_nemo(monkeypatch):
    monkeypatch.setitem(sys.modules, "asr", None)
    assert engine_class("openrouter") is OpenRouterEngine


def test_local_factory_selects_local_engine(monkeypatch):
    from local_engine import LocalWorkerEngine
    monkeypatch.setitem(sys.modules, "asr", None)
    assert engine_class("local") is LocalWorkerEngine


def test_remote_websocket_vad_final_and_end_drain():
    requests = []

    def handler(request):
        assert request.headers["authorization"] == "Bearer test-key"
        body = json.loads(request.content)
        assert body["model"] == "remote-test-model"
        with wave.open(io.BytesIO(base64.b64decode(body["input_audio"]["data"])), "rb") as wav:
            assert (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) == (16000, 1, 2)
            requests.append(wav.readframes(wav.getnframes()))
        return httpx.Response(200, json={"text": "Dzień dobry."})

    class MockEngine(OpenRouterEngine):
        async def start(self):
            await super().start()
            await self.client.aclose()
            self.client = httpx.AsyncClient(transport=httpx.MockTransport(handler),
                                           headers={"Authorization": "Bearer test-key"})

    cfg = Settings(asr_backend="openrouter", openrouter_api_key="test-key",
                   openrouter_model="remote-test-model", end_silence_ms=100,
                   enable_partials=False)
    app = create_app(cfg, engine_factory=MockEngine, vad_factory=FakeVAD)
    with TestClient(app) as client, client.websocket_connect("/v1/transcribe") as ws:
        ready = ws.receive_json()
        assert ready["model"] == "remote-test-model" and ready["partials"] is False
        assert client.get('/health').json()['backend'] == 'openrouter'
        # Dłużej od progu partial, a mimo to jedno wywołanie na cały segment.
        speech(ws, frames=70)
        ws.send_bytes(b'\0' * FRAME_BYTES * 5)
        first = ws.receive_json()
        assert first['type'] == 'final' and first['reason'] == 'silence'
        speech(ws, frames=10, value=33)
        ws.send_text('{"type":"end"}')
        messages = until(ws, 'done')
        assert [m['type'] for m in messages] == ['final', 'done']
        assert messages[0]['segment_id'] == 2
        assert len(requests) == 2
        assert len(requests[0]) == 75 * FRAME_BYTES
        assert len(requests[1]) == 10 * FRAME_BYTES


@pytest.mark.parametrize('status', [401, 402, 429, 500])
def test_http_failure_does_not_leak_key_or_retry(status):
    async def check():
        calls = []
        def handler(request):
            calls.append(request)
            return httpx.Response(status, json={'error': {'message': 'secret-key'}})
        engine = OpenRouterEngine(Settings(asr_backend='openrouter', openrouter_api_key='secret-key'))
        engine.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        try:
            with pytest.raises(StreamError) as exc:
                await engine.transcribe(DecodeJob(1, 0, 160, b'\0'*320, final=True))
            assert 'secret-key' not in str(exc.value)
            assert str(status) in str(exc.value)
            assert len(calls) == 1
        finally:
            await engine.close()
    asyncio.run(check())


def test_missing_remote_key_fails_before_start():
    async def check():
        with pytest.raises(RuntimeError, match='OPENROUTER_API_KEY'):
            await OpenRouterEngine(Settings(asr_backend='openrouter')).start()
    asyncio.run(check())


def test_launcher_switches_build_and_gpu_without_changing_endpoint(tmp_path):
    config = tmp_path / 'config.env'
    config.write_text('ASR_BACKEND=openrouter\nOPENROUTER_API_KEY="test-key"\nDEVICE=cuda\n')
    values = read_config(config)
    remote = compose_command(values, 'start')
    assert 'compose.gpu.yaml' not in remote
    assert 'test-key' not in ' '.join(remote)
    values['ASR_BACKEND'] = 'local'
    values['OPENROUTER_API_KEY'] = ''
    assert 'compose.gpu.yaml' in compose_command(values, 'start')
    values['DEVICE'] = 'cpu'
    assert 'compose.gpu.yaml' not in compose_command(values, 'start')


def test_config_never_displays_key_and_rejects_unknown_backend():
    assert 'secret-key' not in repr(Settings(openrouter_api_key='secret-key'))
    with pytest.raises(ValueError, match='ASR_BACKEND'):
        Settings(asr_backend='typo')
    with pytest.raises(ValueError, match='WORD_TIMESTAMPS'):
        Settings(asr_backend='openrouter', word_timestamps=True)
