import io
import json
import logging
import wave

import httpx
import pytest

from conftest import make_client


def wav_bytes():
    output = io.BytesIO()
    with wave.open(output, "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(22050)
        wav.writeframes(b"\x00\x00" * 2205)
    return output.getvalue()


def test_local_speech_returns_wav_without_a_cloud_key(caplog):
    audio = wav_bytes()
    caplog.set_level(logging.INFO)

    def handler(request):
        assert str(request.url) == "http://127.0.0.1:7001/synthesize"
        assert json.loads(request.content) == {"text": "Dzień dobry. SPEECH-CANARY"}
        assert "authorization" not in request.headers
        return httpx.Response(200, content=audio, headers={"content-type": "audio/wav"})

    with make_client(handler, openrouter_api_key=None) as client:
        result = client.post("/api/speak", json={"text": "Dzień dobry. SPEECH-CANARY"})
    assert result.status_code == 200
    assert result.content == audio
    assert result.headers["content-type"] == "audio/wav"
    assert result.headers["cache-control"] == "no-store"
    assert "SPEECH-CANARY" not in caplog.text


@pytest.mark.parametrize("body", [{"text": ""}, {"text": "   "}, {"text": "x" * 4001},
                                     {"text": "hello", "url": "https://evil.example"}])
def test_invalid_speech_never_reaches_synthesizer(body):
    with make_client(lambda _: pytest.fail("unexpected synthesis")) as client:
        assert client.post("/api/speak", json=body).status_code == 422


def test_foreign_origin_cannot_trigger_speech():
    with make_client(lambda _: pytest.fail("unexpected synthesis")) as client:
        result = client.post("/api/speak", json={"text": "hello"}, headers={"origin": "https://evil.example"})
    assert result.status_code == 403


@pytest.mark.parametrize("response", [httpx.Response(429, text="PRIVATE-DETAIL"),
    httpx.Response(200, text="PRIVATE-DETAIL", headers={"content-type": "audio/wav"}),
    httpx.Response(200, content=wav_bytes(), headers={"content-type": "text/plain"})])
def test_bad_synthesizer_responses_return_safe_error(response):
    with make_client(lambda _: response) as client:
        result = client.post("/api/speak", json={"text": "hello"})
    assert result.status_code == 502
    assert result.json() == {"error": "tts_unavailable"}


@pytest.mark.parametrize("error,status,code", [(httpx.ConnectError("PRIVATE-DETAIL"), 502, "tts_unavailable"),
    (httpx.ReadTimeout("PRIVATE-DETAIL"), 504, "tts_timeout")])
def test_synthesizer_transport_failures_are_redacted(error, status, code):
    def handler(_):
        raise error
    with make_client(handler) as client:
        result = client.post("/api/speak", json={"text": "hello"})
    assert result.status_code == status
    assert result.json() == {"error": code}


def test_oversized_audio_is_rejected():
    with make_client(lambda _: httpx.Response(200, content=wav_bytes() + b"x" * (8 * 1024 * 1024),
                                             headers={"content-type": "audio/wav"})) as client:
        result = client.post("/api/speak", json={"text": "hello"})
    assert result.status_code == 502
