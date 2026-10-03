import base64
import json

import httpx
import pytest

from app import stt_whisper
from app.audio_processing import AudioChunk
from app.stt import TranscriptionError
from conftest import make_client


@pytest.fixture(autouse=True)
def isolated_env(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("STT_AUDIO_DEBUG_DIR", raising=False)
    # Isolate persistence from codec/VAD tests. Model uploads now always use WAV.
    monkeypatch.setattr(stt_whisper, "prepare_audio", lambda audio, fmt: [AudioChunk(audio, 0, ((0, 10),))])


@pytest.mark.parametrize("mime,fmt", [("audio/webm;codecs=opus", "webm"),
                                     ("audio/x-wav", "wav"), ("audio/ogg", "ogg")])
def test_saved_bytes_match_outgoing_payload(monkeypatch, tmp_path, mime, fmt):
    monkeypatch.setattr(stt_whisper, "SERVER_DIR", tmp_path)
    monkeypatch.setenv("STT_AUDIO_DEBUG_DIR", "audio-debug")
    audio = b"\x00\xffexact microphone bytes"
    sent = []

    def upstream(request):
        payload = json.loads(request.content)
        sent.append(base64.b64decode(payload["input_audio"]["data"]))
        files = list((tmp_path / "audio-debug").glob("*.wav"))
        assert len(files) == len(sent)  # Saved before each request, with unique names.
        assert all(file.read_bytes() == sent[-1] == audio for file in files)
        assert payload["input_audio"]["format"] == "wav"
        return httpx.Response(200, json={"text": "gotowe"})

    monkeypatch.setattr(stt_whisper, "transport", httpx.MockTransport(upstream))
    with make_client(lambda request: pytest.fail("unexpected chat request"), stt_mode="whisper") as client:
        for _ in range(2):
            result = client.post("/api/transcribe", content=audio, headers={"content-type": mime})
            assert result.status_code == 200
            assert result.json() == {"text": "gotowe"}
    assert len(sent) == 2


def test_debug_disabled_by_default(monkeypatch, tmp_path):
    monkeypatch.setattr(stt_whisper, "SERVER_DIR", tmp_path)
    monkeypatch.setattr(stt_whisper, "transport", httpx.MockTransport(
        lambda request: httpx.Response(200, json={"text": "ok"})))
    assert stt_whisper.transcribe_whisper(b"audio", "audio/wav") == "ok"
    assert list(tmp_path.iterdir()) == []


def test_stub_does_not_save(monkeypatch, tmp_path):
    directory = tmp_path / "recordings"
    monkeypatch.setenv("STT_AUDIO_DEBUG_DIR", str(directory))
    with make_client(lambda request: pytest.fail("unexpected upstream")) as client:
        assert client.post("/api/transcribe", content=b"audio",
                           headers={"content-type": "audio/wav"}).status_code == 200
    assert not directory.exists()


def test_save_failure_does_not_block_transcription(monkeypatch, tmp_path, caplog):
    directory = tmp_path / "not-a-directory"
    directory.write_text("existing file")
    monkeypatch.setenv("STT_AUDIO_DEBUG_DIR", str(directory))
    monkeypatch.setattr(stt_whisper, "transport", httpx.MockTransport(
        lambda request: httpx.Response(200, json={"text": "ok"})))
    assert stt_whisper.transcribe_whisper(b"private-audio", "audio/wav") == "ok"
    assert "Audio debug save failed" in caplog.text
    assert "private-audio" not in caplog.text
    assert directory.read_text() == "existing file"


def test_upstream_failure_keeps_recording(monkeypatch, tmp_path):
    monkeypatch.setenv("STT_AUDIO_DEBUG_DIR", str(tmp_path))
    monkeypatch.setattr(stt_whisper, "transport", httpx.MockTransport(
        lambda request: httpx.Response(500)))
    with pytest.raises(TranscriptionError):
        stt_whisper.transcribe_whisper(b"audio", "audio/wav")
    assert [file.read_bytes() for file in tmp_path.iterdir()] == [b"audio"]
