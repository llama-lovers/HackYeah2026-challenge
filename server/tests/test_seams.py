import asyncio
import json
import threading

import httpx
import pytest

from app.main import create_app
from conftest import make_client, make_settings, openrouter_reply
from fastapi.testclient import TestClient

EFFECT = {"action": {"kind": "click", "name": "Znajdź", "role": "button"},
          "diff": {"added": [], "removed": [], "changed": [], "alerts": ["Paczka w drodze"]}}


def test_stub_default_and_override():
    with make_client(lambda request: pytest.fail("unexpected upstream")) as client:
        for suffix, expected in [("", "kliknij Znajdź"), ("?text=wpisz%201%20w%20pole", "wpisz 1 w pole"), ("?text=przesy%C5%82ki", "przesyłki")]:
            result = client.post("/api/transcribe" + suffix, content=b"audio", headers={"content-type": "audio/webm;codecs=opus"})
            assert result.status_code == 200
            assert result.json() == {"text": expected}


@pytest.mark.parametrize("mime,content,status,code", [("text/plain", b"audio", 415, "unsupported_media_type"), ("audio/wav", b"", 400, "empty_audio")])
def test_audio_validation(mime, content, status, code):
    with make_client(lambda request: pytest.fail("unexpected upstream")) as client:
        result = client.post("/api/transcribe", content=content, headers={"content-type": mime})
    assert result.status_code == status and result.json() == {"error": code}


@pytest.mark.parametrize("outcome,status,expected", [("kliknij Znajdź", 200, {"text": "kliknij Znajdź"}), ("", 200, {"text": ""}), ("timeout", 504, {"error": "timeout"}), ("provider_error", 502, {"error": "provider_error"}), ("unsupported_format", 502, {"error": "unsupported_format"}), ("generic", 502, {"error": "provider_error"})])
def test_whisper_threadpool_and_errors(monkeypatch, outcome, status, expected):
    from app import stt
    def transcribe(audio_bytes, mime):
        assert audio_bytes == b"\x00exact-audio" and mime == "audio/webm;codecs=opus"
        with pytest.raises(RuntimeError):
            asyncio.get_running_loop()
        if outcome in stt.TRANSCRIPTION_ERROR_CODES:
            raise stt.TranscriptionError(outcome)
        if outcome == "generic":
            raise RuntimeError("BODY-CANARY")
        return outcome
    monkeypatch.setattr(stt, "transcribe", transcribe)
    with make_client(lambda request: pytest.fail("unexpected upstream"), stt_mode="whisper") as client:
        result = client.post("/api/transcribe?text=ignored", content=b"\x00exact-audio", headers={"content-type": "audio/webm;codecs=opus"})
    assert result.status_code == status and result.json() == expected


def test_missing_whisper_module():
    with make_client(lambda request: pytest.fail("unexpected upstream"), stt_mode="whisper") as client:
        result = client.post("/api/transcribe", content=b"audio", headers={"content-type": "audio/wav"})
    assert result.status_code == 502 and result.json() == {"error": "provider_error"}


def test_effect_schema_and_limits():
    from app.schemas import EFFECT_SCHEMA
    captured = []
    def handler(request):
        captured.append(json.loads(request.content))
        return openrouter_reply(json.dumps({"say": "Paczka jest w drodze."}))
    with make_client(handler) as client:
        result = client.post("/api/effect", json=EFFECT)
        assert result.status_code == 200 and result.json() == {"say": "Paczka jest w drodze."}
        for diff in [{**EFFECT["diff"], "added": ["x"] * 9}, {**EFFECT["diff"], "unknown": "x"}]:
            assert client.post("/api/effect", json={**EFFECT, "diff": diff}).status_code == 422
    data = captured[0]
    assert data["response_format"]["json_schema"] == {"name": "effect_summary", "strict": True, "schema": EFFECT_SCHEMA}
    assert data["max_tokens"] == 150


@pytest.mark.parametrize("key,response,status,code", [(None, None, 503, "no_api_key"), ("test-key", openrouter_reply("bad"), 502, "model_invalid_output"), ("test-key", openrouter_reply('{"say":"x","extra":1}'), 502, "model_invalid_output")])
def test_effect_errors(key, response, status, code):
    with make_client(lambda request: response, openrouter_api_key=key) as client:
        result = client.post("/api/effect", json=EFFECT)
    assert result.status_code == status and result.json() == {"error": code}


def fake_body(utterance="", snapshot="", diff=None):
    name = "action_proposal" if diff is None else "effect_summary"
    content = f"<utterance>\n{utterance}\n</utterance>\n<page_snapshot>\n{snapshot}\n</page_snapshot>" if diff is None else f'<executed_action>\n{{}}\n</executed_action>\n<page_diff>\n{json.dumps(diff)}\n</page_diff>'
    return {"response_format": {"json_schema": {"name": name}}, "messages": [{"role": "user", "content": content}]}


@pytest.mark.parametrize("utterance,action,target,text,say", [
    ("kliknij Znajdź.", "click", "e4", "", ""),
    ("wpisz 8732 3498 w pole numeru przesyłki", "fill", "e3", "87323498", ""),
    ("kliknij nieistniejący", "click", "e999", "", ""),
    ("wpisz 123 w przycisk Znajdź", "fill", "e4", "123", ""),
    ("kliknij Brak", "none", "", "", "Nie widzę takiego elementu."),
    ("nieznane", "none", "", "", "Nie rozumiem polecenia."),
])
def test_fake_action_rules(utterance, action, target, text, say):
    from tests.fake_openrouter import fake_reply
    snapshot = 'textbox e3 "Enter parcel numbers separated by commas" placeholder="Wpisz numer przesyłki"\nbutton e4 "Znajdź"'
    result = json.loads(fake_reply(fake_body(utterance, snapshot))["choices"][0]["message"]["content"])
    assert result == {"action": action, "target": target, "text": text, "say": say, "needs_confirmation": False}


@pytest.mark.parametrize("diff,expected", [({"alerts": ["alert"], "added": ["added"]}, "alert"), ({"added": ["added"]}, "added"), ({"changed": [{"name": "Pole", "what": "enabled"}]}, "Pole enabled"), ({"title": {"after": "title"}}, "title"), ({"path": {"after": "/path"}}, "/path"), ({}, None)])
def test_fake_effect_rules(diff, expected):
    from tests.fake_openrouter import fake_reply
    result = json.loads(fake_reply(fake_body(diff=diff))["choices"][0]["message"]["content"])
    assert result == {"say": "Zmiana na stronie: " + expected if expected else "Zmiana na stronie."}


def test_real_http_fake_upstream(tmp_path):
    from tests.fake_openrouter import make_server
    record = tmp_path / "requests.jsonl"
    server = make_server(0, record)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        app = create_app(make_settings(openrouter_base_url=f"http://127.0.0.1:{server.server_port}/api/v1"))
        with TestClient(app, base_url="http://localhost") as client:
            result = client.post("/api/action", json={"utterance": "kliknij Znajdź", "snapshot": 'path: /tracking\nbutton e4 "Znajdź"'})
            assert result.status_code == 200 and result.json()["target"] == "e4"
        lines = record.read_text().splitlines()
        assert len(lines) == 1 and "<page_snapshot>" in json.loads(lines[0])["messages"][1]["content"]
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
