import base64
import io
import json
import shutil
import subprocess
import wave

import httpx
import numpy as np
import pytest

from app import audio_processing as audio, stt_whisper
from app.stt import TranscriptionError


def sample_audio():
    samples = np.zeros(4 * audio.SAMPLE_RATE, dtype=np.float32)
    t = np.arange(audio.SAMPLE_RATE) / audio.SAMPLE_RATE
    samples[16000:32000] = 0.3 * np.sin(2 * np.pi * 220 * t)
    return samples


def speech_in_middle(samples):
    return [(16000, 32000)]


@pytest.fixture
def controlled_speech(monkeypatch):
    monkeypatch.setattr(audio, "detect_speech", speech_in_middle)


def test_wav_roundtrip():
    samples = sample_audio()
    decoded = audio.decode_audio(audio.encode_wav(samples), "wav")
    np.testing.assert_allclose(decoded, samples, atol=1 / 32768)


def test_webm_stereo_48khz_is_decoded_to_mono_16khz():
    encoded = subprocess.run(
        [shutil.which("ffmpeg"), "-hide_banner", "-loglevel", "error", "-f", "wav", "-i", "pipe:0",
         "-ar", "48000", "-ac", "2", "-c:a", "libopus", "-f", "webm", "pipe:1"],
        input=audio.encode_wav(sample_audio()), capture_output=True, check=True,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    ).stdout
    decoded = audio.decode_audio(encoded, "webm")
    assert decoded.ndim == 1
    assert abs(len(decoded) - 64000) < 160
    assert np.max(np.abs(decoded[16000:32000])) > 0.2


def test_gate_keeps_context_and_does_not_wrap_at_edges():
    samples = np.ones(3 * 16000, dtype=np.float32) * 0.4
    gated = audio.gate_audio(samples, [(0, 16000)])
    np.testing.assert_allclose(gated[:23000], samples[:23000])
    assert np.max(np.abs(gated[25000:])) < 0.001
    assert 0 < gated[23999] < 0.4  # Fade at the edge of the margin.


def test_trim_and_timestamp_alignment(controlled_speech):
    chunks = audio.prepare_audio(audio.encode_wav(sample_audio()), "wav")
    assert len(chunks) == 1
    chunk = chunks[0]
    assert chunk.start_seconds == pytest.approx(0.5, abs=0.01)
    assert chunk.speech_ranges[0][0] + chunk.start_seconds == 1
    assert chunk.speech_ranges[0][1] + chunk.start_seconds == 2
    with wave.open(io.BytesIO(chunk.wav)) as wav:
        assert (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) == (1, 2, 16000)
        assert wav.getnframes() / 16000 == pytest.approx(2, abs=0.02)


def test_no_speech_skips_api_and_debug(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("STT_AUDIO_DEBUG_DIR", str(tmp_path))
    monkeypatch.setattr(audio, "detect_speech", lambda samples: [])
    monkeypatch.setattr(stt_whisper, "transport", httpx.MockTransport(lambda r: pytest.fail("silence uploaded")))
    assert stt_whisper.transcribe_whisper(audio.encode_wav(np.zeros(16000)), "audio/wav") == ""
    assert list(tmp_path.iterdir()) == []


def test_real_silero_silence():
    audio.initialize_audio_processing()
    assert audio.detect_speech(np.zeros(16000, dtype=np.float32)) == []


def test_decode_rejects_invalid_or_overlong_audio():
    for content in (b"not a wav", audio.encode_wav(np.zeros(61 * 16000))):
        with pytest.raises(TranscriptionError) as exc:
            audio.decode_audio(content, "wav")
        assert exc.value.code == "unsupported_format"


def test_chunks_do_not_overlap_or_exceed_30_seconds():
    ranges = audio.segment_ranges([[0, 61000]], 61000)
    assert ranges == [(0, 30000), (30000, 60000), (60000, 61000)]
    assert audio.segment_ranges([[1000, 2000], [2400, 4000]], 5000) == [(500, 4500)]


def test_processed_bytes_are_saved_and_sent(controlled_speech, monkeypatch, tmp_path):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.setenv("STT_MODEL", "openai/whisper-large-v3")
    monkeypatch.setenv("STT_AUDIO_DEBUG_DIR", str(tmp_path))
    original = audio.encode_wav(sample_audio())

    def handler(request):
        payload = json.loads(request.content)
        processed = base64.b64decode(payload["input_audio"]["data"])
        assert processed != original
        assert list(tmp_path.glob("*.wav"))[0].read_bytes() == processed
        assert payload["response_format"] == "verbose_json"
        return httpx.Response(200, json={"text": "dwadzieścia trzy", "language": "polish",
            "segments": [{"start": 0.5, "end": 1.5, "text": "dwadzieścia trzy",
                          "avg_logprob": -0.2, "compression_ratio": 1.0}]})

    monkeypatch.setattr(stt_whisper, "transport", httpx.MockTransport(handler))
    assert stt_whisper.transcribe_whisper(original, "audio/wav") == "dwadzieścia trzy"


def test_multiple_chunks_preserve_order(monkeypatch):
    monkeypatch.setenv("OPENROUTER_API_KEY", "test-key")
    monkeypatch.delenv("STT_AUDIO_DEBUG_DIR", raising=False)
    monkeypatch.setattr(stt_whisper, "prepare_audio", lambda data, fmt: [
        audio.AudioChunk(b"first", 0, ((0, 1),)), audio.AudioChunk(b"second", 30, ((0, 1),))])
    seen = []

    def handler(request):
        seen.append(base64.b64decode(json.loads(request.content)["input_audio"]["data"]))
        return httpx.Response(200, json={"text": "raz" if len(seen) == 1 else "dwa"})

    monkeypatch.setattr(stt_whisper, "transport", httpx.MockTransport(handler))
    assert stt_whisper.transcribe_whisper(b"input", "audio/wav") == "raz dwa"
    assert seen == [b"first", b"second"]
