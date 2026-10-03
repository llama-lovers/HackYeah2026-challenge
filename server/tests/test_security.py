import base64
import json
import logging
import re
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest

from app.config import SERVER_DIR, Settings, load_env_file
from app.main import create_app
from conftest import make_client, make_settings, openrouter_reply
from test_action import BODY, PROPOSAL

ORIGIN = "chrome-extension://" + "a" * 32


def test_foreign_origin_rejected_before_upstream():
    with make_client(lambda request: pytest.fail("unexpected upstream")) as client:
        result = client.post("/api/action", content="bad", headers={"origin": "https://evil.example", "content-type": "text/plain"})
    assert result.status_code == 403
    assert result.json() == {"error": "forbidden_origin"}


def test_origin_cors_host_and_disabled_docs():
    with make_client(lambda request: openrouter_reply(json.dumps(PROPOSAL))) as client:
        for headers in [{}, {"origin": ORIGIN}]:
            assert client.post("/api/action", json=BODY, headers=headers).status_code == 200
        result = client.options("/api/action", headers={"origin": ORIGIN, "access-control-request-method": "POST", "access-control-request-headers": "content-type"})
        assert result.status_code == 200 and result.headers["access-control-allow-origin"] == ORIGIN
        assert client.get("/health", headers={"host": "evil.example"}).status_code == 400
        assert client.get("/docs").status_code == client.get("/openapi.json").status_code == 404


def test_declared_and_chunked_body_limits():
    with make_client(lambda request: pytest.fail("unexpected upstream"), max_body_bytes=16) as client:
        declared = client.post("/api/transcribe", content=b"x" * 17, headers={"content-type": "audio/wav"})
        chunked = client.post("/api/transcribe", content=iter([b"x" * 8, b"x" * 9]), headers={"content-type": "audio/wav"})
    for result in [declared, chunked]:
        assert result.status_code == 413 and result.json() == {"error": "request_too_large"}


def test_chunked_action_never_reaches_upstream():
    with make_client(lambda request: pytest.fail("unexpected upstream"), max_body_bytes=128) as client:
        result = client.post("/api/action", content=iter([json.dumps(BODY).encode(), b" " * 200]), headers={"content-type": "application/json"})
    assert result.status_code == 413


def test_body_free_logs_and_safe_errors(caplog):
    caplog.set_level(logging.INFO, logger="voice_agent.access")
    with make_client(lambda request: openrouter_reply(json.dumps(PROPOSAL))) as client:
        @client.app.get("/explode")
        async def explode():
            raise RuntimeError("CANARY-EXC-3307")
        def request(kind):
            if kind == "ok":
                return client.post("/api/action", json={**BODY, "utterance": "CANARY-UTTERANCE-7781"})
            if kind == "invalid":
                return client.post("/api/action", json={**BODY, "utterance": "CANARY-422-5512" * 100})
            if kind == "query":
                return client.get("/health?q=CANARY-QUERY-9")
            return client.get("/explode")
        with ThreadPoolExecutor(4) as pool:
            results = list(pool.map(request, ["ok", "invalid", "query", "explode"]))
    assert [r.status_code for r in results] == [200, 422, 200, 500]
    assert results[3].json() == {"error": "internal"}
    assert results[1].json() == {"error": "invalid_request", "fields": ["body.utterance"]}
    messages = "\n".join(record.getMessage() for record in caplog.records if record.name == "voice_agent.access")
    assert "POST /api/action -> 200" in messages and "GET /health -> 200" in messages
    assert not any(canary in messages for canary in ["CANARY-UTTERANCE-7781", "CANARY-422-5512", "CANARY-QUERY-9", "CANARY-EXC-3307"])
    assert not any(canary in caplog.text for canary in ["CANARY-UTTERANCE-7781", "CANARY-422-5512", "CANARY-QUERY-9", "CANARY-EXC-3307"])
    for line in messages.splitlines():
        assert re.fullmatch(r"(?:GET|POST) /[a-z/]+ -> \d{3} \d+ms|unhandled RuntimeError on GET /explode", line)


def test_env_loading_and_defaults(monkeypatch, tmp_path):
    monkeypatch.setenv("EXISTING_PROXY_TEST", "original")
    for key in ["NEW_PROXY_TEST", "EMPTY_PROXY_TEST", "SINGLE_PROXY_TEST"]:
        monkeypatch.delenv(key, raising=False)
    path = tmp_path / ".env"
    path.write_text('# comment\nEXISTING_PROXY_TEST=changed\nNEW_PROXY_TEST="quoted"\nEMPTY_PROXY_TEST=\nSINGLE_PROXY_TEST=\'single\'\n')
    load_env_file(path)
    import os
    assert os.environ["EXISTING_PROXY_TEST"] == "original"
    assert os.environ["NEW_PROXY_TEST"] == "quoted" and os.environ["SINGLE_PROXY_TEST"] == "single"
    assert "EMPTY_PROXY_TEST" not in os.environ
    load_env_file(tmp_path / "missing")
    settings = Settings.from_env({"OPENROUTER_API_KEY": "", "STT_MODE": "", "ALLOWED_HOSTS": "192.0.2.1", "WARMUP_ON_START": "true"})
    assert settings.openrouter_api_key is None and settings.stt_mode == "stub"
    assert settings.allowed_hosts == ("localhost", "127.0.0.1", "192.0.2.1") and settings.warmup_on_start
    with make_client(lambda request: pytest.fail("unexpected upstream")) as client:
        assert client.get("/health").json() == {"ok": True}


def test_extension_id_resolution(tmp_path):
    from app.config import extension_id_from_key, resolve_extension_id
    key = base64.b64encode(b"abc").decode()
    assert extension_id_from_key(key) == "lkhibglpipabmpokebebeanofnkocccd"
    path = tmp_path / "manifest.json"
    assert resolve_extension_id({}, path) is None
    path.write_text(json.dumps({"key": key}))
    assert resolve_extension_id({}, path) == "lkhibglpipabmpokebebeanofnkocccd"
    assert resolve_extension_id({"EXTENSION_ID": "a" * 32}, path) == "a" * 32
    with pytest.raises(ValueError):
        resolve_extension_id({"EXTENSION_ID": "wrong"}, path)


def test_env_template_names_only():
    lines = (SERVER_DIR / ".env.example").read_text().splitlines()
    names = [line for line in lines if line.strip() and not line.startswith("#")]
    assert len(names) == 12 and "OPENROUTER_API_KEY=" in names
    assert "STT_AUDIO_DEBUG_DIR=" in names
    assert all(re.fullmatch(r"[A-Z_]+=", line) for line in names)


def test_warmup_is_optional_and_redacted(caplog):
    captured = []
    def handler(request):
        data = json.loads(request.content)
        captured.append(data)
        return httpx.Response(500, text="WARMUP-CANARY")
    caplog.set_level(logging.INFO)
    with make_client(handler, warmup_on_start=True) as client:
        assert client.get("/health").status_code == 200
    assert len(captured) == 2 and {r["response_format"]["json_schema"]["name"] for r in captured} == {"action_proposal", "effect_summary"}
    assert all(r["max_tokens"] == 50 for r in captured)
    assert "WARMUP-CANARY" not in caplog.text
    with make_client(handler, warmup_on_start=True, openrouter_api_key=None):
        pass
    assert len(captured) == 2


@pytest.mark.anyio
async def test_chunked_raw_asgi_limit_and_no_application_call():
    from app.middleware import BodyLimitMiddleware
    called = False
    async def inner(scope, receive, send):
        nonlocal called
        called = True
    chunks = iter([{"type": "http.request", "body": b"1234", "more_body": True}, {"type": "http.request", "body": b"5678", "more_body": False}])
    async def receive():
        return next(chunks)
    sent = []
    async def send(message):
        sent.append(message)
    await BodyLimitMiddleware(inner, max_bytes=7)({"type": "http", "headers": []}, receive, send)
    assert not called and sent[0]["status"] == 413
