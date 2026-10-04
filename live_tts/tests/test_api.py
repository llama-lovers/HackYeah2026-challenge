import asyncio
import io
import wave
import pytest
from fastapi.testclient import TestClient
from config import Settings
from server import create_app


@pytest.fixture(scope="module")
def client():
    if not Settings().model_path.exists(): pytest.skip("Download voice for real API tests")
    with TestClient(create_app()) as client:
        yield client


def test_health_and_real_wav(client):
    health = client.get("/health").json()
    assert health["voice"] == "pl_PL-mc_speech-medium"
    assert health["model_load_count"] == 1
    assert health["parameters"] == Settings().parameters
    for text in ["Dzień dobry, w czym mogę dzisiaj pomóc?", "Do zapłaty są dwieście czterdzieści dziewięć złotych i dziewięćdziesiąt dziewięć groszy."]:
        response = client.post("/synthesize", json={"text":text})
        assert response.status_code == 200
        with wave.open(io.BytesIO(response.content)) as wav:
            assert wav.getframerate() == 22050 and wav.getnframes() > 0
            assert any(wav.readframes(wav.getnframes()))
    assert client.get("/health").json()["model_load_count"] == 1


def test_stream_content(client):
    result = client.post("/synthesize/stream", json={"text":"Dzień dobry. Jak się masz?"})
    assert result.status_code == 200
    assert result.headers["x-audio-encoding"] == "pcm_s16le"
    assert int(result.headers["x-sample-rate"]) == 22050
    assert len(result.content)>0 and len(result.content)%2==0
    assert not result.content.startswith(b"RIFF")


@pytest.mark.parametrize("text", ["", " ", "...", "a"*4001])
def test_invalid_text(client, text):
    assert client.post("/synthesize", json={"text":text}).status_code == 422


def test_busy(client):
    client.app.state.busy = True
    try:
        assert client.post("/synthesize", json={"text":"Test"}).status_code == 429
        assert client.get("/health").status_code == 200
    finally: client.app.state.busy = False


class FailingEngine:
    ready=True; sample_rate=22050; encoding="pcm_s16le"; media_type="audio/pcm"
    async def start(self): pass
    async def close(self): pass
    async def synthesize_stream(self, text):
        raise RuntimeError("private upstream details")
        yield b""


def test_first_chunk_failure_releases_slot():
    with TestClient(create_app(engine_factory=lambda cfg:FailingEngine())) as client:
        for _ in range(2):
            response=client.post("/synthesize/stream",json={"text":"Test"})
            assert response.status_code==502
            assert "private" not in response.text
            assert not client.app.state.busy
