import asyncio
import threading
from dataclasses import replace

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

import server
from config import FRAME_BYTES, Settings
from streaming import DecodeMailbox


class FakeVAD:
    def is_speech(self, frame, sample_rate):
        assert sample_rate == 16000
        assert len(frame) == FRAME_BYTES
        return any(frame)


class FakeEngine:
    def __init__(self, settings):
        self.ready = False
        self.jobs = []

    async def start(self):
        self.ready = True

    async def close(self):
        self.ready = False

    async def transcribe(self, job):
        self.jobs.append(job)
        await asyncio.sleep(0.005)
        return {"text": f"audio_{job.pcm[0]}_{len(job.pcm)}", "inference_ms": 5.0}


def make_app(engine=FakeEngine, **kwargs):
    cfg = replace(Settings(), min_partial_ms=200, partial_interval_ms=100,
                  end_silence_ms=100, pre_roll_ms=60, speech_start_ms=60,
                  max_segment_ms=2000, **kwargs)
    return server.create_app(cfg, engine_factory=engine, vad_factory=FakeVAD)


def speech(ws, frames=10, value=17):
    for _ in range(frames):
        ws.send_bytes(bytes([value, 0]) * 320)


def until(ws, wanted):
    results = []
    while True:
        result = ws.receive_json()
        results.append(result)
        assert result["type"] != "error", result
        if result["type"] == wanted:
            return results


def test_partial_arrives_while_client_can_still_send_audio():
    app = make_app()
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "ready"
        speech(ws)
        partial = until(ws, "partial")[-1]  # Nie wysłano end ani ciszy.
        assert partial["segment_id"] == 1
        speech(ws, frames=3)
        ws.send_text('{"type":"end"}')
        results = until(ws, "done")
        final = [r for r in results if r["type"] == "final"]
        assert len(final) == 1
        assert final[0]["text"] == f"audio_17_{13 * FRAME_BYTES}"
        assert final[0]["end_ms"] == 260
        assert final[0]["revision"] > partial["revision"]


def test_receiving_continues_during_blocked_inference(monkeypatch):
    entered = threading.Event()
    release = threading.Event()
    final_queued = threading.Event()

    class BlockedEngine(FakeEngine):
        async def transcribe(self, job):
            if not job.final:
                entered.set()
                if not await asyncio.to_thread(release.wait, 3):
                    raise RuntimeError("Test nie zwolnił inferencji")
            return await super().transcribe(job)

    class ObservedMailbox(DecodeMailbox):
        def put(self, job):
            super().put(job)
            if job.final:
                final_queued.set()

    monkeypatch.setattr(server, "DecodeMailbox", ObservedMailbox)
    with TestClient(make_app(BlockedEngine)) as client, client.websocket_connect("/ws") as ws:
        ws.receive_json()
        speech(ws)
        assert entered.wait(1)
        try:
            speech(ws, frames=5)
            ws.send_text('{"type":"end"}')
            assert final_queued.wait(1), "Odbiór audio był zablokowany przez inferencję"
        finally:
            release.set()
        results = until(ws, "done")
        assert [r["type"] for r in results] == ["partial", "final", "done"]
        assert results[-2]["end_ms"] == 300


def test_flush_keeps_connection_and_absolute_timeline():
    with TestClient(make_app()) as client, client.websocket_connect("/v1/transcribe") as ws:
        ws.receive_json()
        speech(ws, 7)
        ws.send_text('{"type":"flush"}')
        first = until(ws, "final")[-1]
        assert first["reason"] == "flush"
        speech(ws, 8, value=33)
        ws.send_text('{"type":"end"}')
        results = until(ws, "done")
        second = [r for r in results if r["type"] == "final"][0]
        assert second["segment_id"] == 2
        assert first["end_ms"] == second["start_ms"] == 140
        assert second["end_ms"] == 300
        assert second["text"].startswith("audio_33_")


def test_vad_silence_finalizes_without_end():
    with TestClient(make_app()) as client, client.websocket_connect("/ws") as ws:
        ws.receive_json()
        speech(ws, 7)
        ws.send_bytes(b"\0" * (FRAME_BYTES * 5))
        result = until(ws, "final")[-1]
        assert result["reason"] == "silence"
        assert result["end_ms"] == 240
        ws.send_text('{"type":"end"}')
        assert ws.receive_json() == {"type": "done"}


def test_two_connections_keep_audio_and_segment_numbers_separate():
    with TestClient(make_app()) as client:
        with client.websocket_connect("/ws") as one, client.websocket_connect("/ws") as two:
            one.receive_json()
            two.receive_json()
            speech(one, 7, 11)
            speech(two, 9, 22)
            one.send_text('{"type":"end"}')
            two.send_text('{"type":"end"}')
            first = until(one, "final")[-1]
            second = until(two, "final")[-1]
            assert first["segment_id"] == second["segment_id"] == 1
            assert first["text"] == f"audio_11_{7 * FRAME_BYTES}"
            assert second["text"] == f"audio_22_{9 * FRAME_BYTES}"
            until(one, "done")
            until(two, "done")
        assert client.get("/health").json()["connections"] == 0


@pytest.mark.parametrize("payload", ["not-json", "[]", "null", '{"type":"unknown"}'])
def test_invalid_command_returns_error(payload):
    with TestClient(make_app()) as client, client.websocket_connect("/ws") as ws:
        ws.receive_json()
        ws.send_text(payload)
        assert ws.receive_json()["type"] == "error"
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
        assert closed.value.code == 1008


def test_incomplete_sample_on_end_returns_error():
    with TestClient(make_app()) as client, client.websocket_connect("/ws") as ws:
        ws.receive_json()
        ws.send_bytes(b"\x01")
        ws.send_text('{"type":"end"}')
        assert "Niepełna próbka" in ws.receive_json()["message"]


def test_connection_limit_and_release_on_disconnect():
    with TestClient(make_app(max_connections=1)) as client:
        with client.websocket_connect("/ws") as first:
            first.receive_json()
            with client.websocket_connect("/ws") as rejected:
                assert rejected.receive_json()["type"] == "error"
        with client.websocket_connect("/ws") as accepted:
            assert accepted.receive_json()["type"] == "ready"
            accepted.send_text('{"type":"end"}')
            assert accepted.receive_json()["type"] == "done"


def test_model_exception_returns_error_and_closes_session():
    class BrokenEngine(FakeEngine):
        async def transcribe(self, job):
            raise RuntimeError("Kontrolowany błąd inferencji")

    with TestClient(make_app(BrokenEngine)) as client, client.websocket_connect("/ws") as ws:
        ws.receive_json()
        speech(ws)
        assert ws.receive_json()["type"] == "error"
        with pytest.raises(WebSocketDisconnect) as closed:
            ws.receive_json()
        assert closed.value.code == 1011


def test_real_webrtc_vad_ignores_pcm_silence():
    app = server.create_app(Settings(), engine_factory=FakeEngine)
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        ws.receive_json()
        ws.send_bytes(b"\0" * 32_000)
        ws.send_text('{"type":"end"}')
        assert ws.receive_json()["type"] == "done"
        assert not app.state.engine.jobs
