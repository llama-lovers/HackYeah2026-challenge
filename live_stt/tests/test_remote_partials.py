import asyncio
import base64
import io
import json
import threading
import wave

import httpx
from fastapi.testclient import TestClient

import server
from config import Settings
from openrouter_engine import OpenRouterEngine
from streaming import DecodeMailbox
from test_server import FakeVAD, speech, until


def mocked_engine(handler):
    class MockEngine(OpenRouterEngine):
        async def start(self):
            await super().start()
            await self.client.aclose()
            self.client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return MockEngine


def audio_in(request):
    body = json.loads(request.content)
    with wave.open(io.BytesIO(base64.b64decode(body['input_audio']['data'])), 'rb') as wav:
        return wav.readframes(wav.getnframes())


def test_remote_partials_revise_same_segment_and_finalize():
    audio_requests = []
    replies = iter(['Chcę sprawdzić staw', 'Chcę sprawdzić stan konta',
                    'Chcę sprawdzić stan konta.', 'Dziękuję.'])

    def handler(request):
        audio_requests.append(audio_in(request))
        return httpx.Response(200, json={'text': next(replies)})

    cfg = Settings(asr_backend='openrouter', openrouter_api_key='test-key',
                   enable_partials=True)
    app = server.create_app(cfg, engine_factory=mocked_engine(handler), vad_factory=FakeVAD)
    with TestClient(app) as client, client.websocket_connect('/v1/transcribe') as ws:
        assert ws.receive_json()['partials'] is True
        speech(ws, frames=50)
        first = ws.receive_json()
        speech(ws, frames=40)
        second = ws.receive_json()
        speech(ws, frames=10)
        ws.send_text('{"type":"flush"}')
        final = ws.receive_json()
        assert [m['type'] for m in [first, second, final]] == ['partial', 'partial', 'final']
        assert [m['segment_id'] for m in [first, second, final]] == [1, 1, 1]
        assert [m['revision'] for m in [first, second, final]] == [1, 2, 3]
        assert first['text'] == 'Chcę sprawdzić staw'
        assert second['text'] == 'Chcę sprawdzić stan konta'
        assert final['text'] == 'Chcę sprawdzić stan konta.'
        assert [len(pcm) for pcm in audio_requests] == [32000, 57600, 64000]
        assert audio_requests[1].startswith(audio_requests[0])
        assert audio_requests[2].startswith(audio_requests[1])
        speech(ws, frames=10, value=33)
        ws.send_text('{"type":"end"}')
        next_segment = ws.receive_json()
        assert next_segment['type'] == 'final' and next_segment['segment_id'] == 2
        assert next_segment['revision'] == 1
        assert next_segment['start_ms'] == final['end_ms'] == 2000
        assert ws.receive_json() == {'type': 'done'}


def test_remote_slow_partial_keeps_receiving_and_coalesces_old_jobs(monkeypatch):
    entered = threading.Event()
    release = threading.Event()
    final_queued = threading.Event()
    lengths = []

    async def handler(request):
        lengths.append(len(audio_in(request)))
        if len(lengths) == 1:
            entered.set()
            assert await asyncio.to_thread(release.wait, 3)
        return httpx.Response(200, json={'text': str(len(lengths))})

    class ObservedMailbox(DecodeMailbox):
        def put(self, job):
            super().put(job)
            if job.final:
                final_queued.set()

    monkeypatch.setattr(server, 'DecodeMailbox', ObservedMailbox)
    cfg = Settings(asr_backend='openrouter', openrouter_api_key='test-key')
    app = server.create_app(cfg, engine_factory=mocked_engine(handler), vad_factory=FakeVAD)
    with TestClient(app) as client, client.websocket_connect('/v1/transcribe') as ws:
        ws.receive_json()
        speech(ws, frames=50)
        assert entered.wait(1)
        try:
            speech(ws, frames=90)
            ws.send_text('{"type":"end"}')
            assert final_queued.wait(1), 'Odbieranie audio zostało zablokowane przez HTTP'
        finally:
            release.set()
        results = until(ws, 'done')
        assert [r['type'] for r in results] == ['partial', 'final', 'done']
        assert lengths == [32000, 89600]
        assert results[1]['end_ms'] == 2800
