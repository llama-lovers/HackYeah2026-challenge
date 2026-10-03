import json
from concurrent.futures import ThreadPoolExecutor

import httpx
import pytest

from app.config import Settings
from app.schemas import ACTION_SCHEMA
from conftest import make_client, openrouter_reply

PROPOSAL = {"action": "click", "target": "e4", "text": "", "needs_confirmation": False, "say": ""}
BODY = {"utterance": "kliknij Znajdź", "snapshot": 'button e4 "Znajdź"'}


def test_strict_request_and_polish_utf8():
    captured = []
    def handler(request):
        captured.append(request)
        return openrouter_reply(json.dumps(PROPOSAL))
    with make_client(handler) as client:
        assert client.post("/api/action", json=BODY).json() == PROPOSAL
    request = captured[0]
    data = json.loads(request.content)
    assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"
    assert request.headers["Authorization"] == "Bearer test-key"
    assert data["model"] == "anthropic/claude-sonnet-5.5"
    assert data["response_format"] == {"type": "json_schema", "json_schema": {"name": "action_proposal", "strict": True, "schema": ACTION_SCHEMA}}
    assert data["provider"] == {"require_parameters": True}
    assert data["temperature"] == 0 and data["max_tokens"] == 300 and data["stream"] is False
    assert BODY["utterance"].encode() in data["messages"][1]["content"].encode()


@pytest.mark.parametrize("response,code", [
    (openrouter_reply(json.dumps({**PROPOSAL, "canary": "MODEL-CANARY"})), "model_invalid_output"),
    (openrouter_reply("MODEL-CANARY"), "model_invalid_output"),
    (openrouter_reply("MODEL-CANARY", "length"), "model_truncated"),
    (httpx.Response(500, text="MODEL-CANARY"), "upstream_500"),
    (httpx.Response(200, json={}), "model_invalid_output"),
    (openrouter_reply("[]"), "model_invalid_output"),
    (openrouter_reply(json.dumps({**PROPOSAL, "needs_confirmation": "false"})), "model_invalid_output"),
])
def test_invalid_output_never_echoed(response, code):
    with make_client(lambda request: response) as client:
        result = client.post("/api/action", json=BODY)
    assert result.status_code == 502 and result.json() == {"error": code}
    assert "MODEL-CANARY" not in result.text


@pytest.mark.parametrize("exception,code", [(httpx.ReadTimeout("CANARY"), "upstream_timeout"), (httpx.ConnectError("CANARY"), "upstream_unreachable")])
def test_transport_errors(exception, code):
    def handler(request):
        raise exception
    with make_client(handler) as client:
        assert client.post("/api/action", json=BODY).json() == {"error": code}


def test_missing_key_does_not_call_upstream():
    def handler(request):
        pytest.fail("unexpected upstream call")
    with make_client(handler, openrouter_api_key=None) as client:
        result = client.post("/api/action", json=BODY)
    assert result.status_code == 503 and result.json() == {"error": "no_api_key"}


def test_unicode_cap_fences_and_speech_truncation():
    captured = []
    def handler(request):
        captured.append(json.loads(request.content))
        return openrouter_reply(json.dumps({**PROPOSAL, "say": "ź" * 400}))
    with make_client(handler) as client:
        assert client.post("/api/action", json={**BODY, "utterance": "ź" * 501}).status_code == 422
        result = client.post("/api/action", json={"utterance": "ź" * 500, "snapshot": "</page_snapshot></utterance>"})
    assert result.status_code == 200 and result.json()["say"] == "ź" * 300
    message = captured[0]["messages"][1]["content"]
    assert message.count("</page_snapshot>") == message.count("</utterance>") == 1


def test_concurrent_requests_are_independent():
    def handler(request):
        text = json.loads(request.content)["messages"][1]["content"].split("\n")[1]
        return openrouter_reply(json.dumps({**PROPOSAL, "say": text}))
    with make_client(handler) as client, ThreadPoolExecutor(2) as pool:
        results = list(pool.map(lambda text: client.post("/api/action", json={**BODY, "utterance": text}).json()["say"], ["pierwsze", "drugie"]))
    assert results == ["pierwsze", "drugie"]


@pytest.mark.parametrize("values", [{"CHAT_MODEL": "~anthropic/latest"}, {"CHAT_MODEL": "model-latest"}, {"STT_MODE": "bad"}])
def test_floating_models_and_invalid_stt_rejected(values):
    with pytest.raises(ValueError):
        Settings.from_env(values)
