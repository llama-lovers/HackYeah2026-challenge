import httpx
import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


@pytest.fixture(autouse=True)
def skip_model_startup(monkeypatch):
    # API contract tests do not load the real VAD model at each lifespan startup.
    monkeypatch.setattr("app.main.initialize_audio_processing", lambda: None)


@pytest.fixture
def anyio_backend():
    return "asyncio"


def make_settings(**overrides):
    return Settings(**{"openrouter_api_key": "test-key", "extension_id": "a" * 32, **overrides})


def openrouter_reply(content: str, finish_reason: str = "stop") -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"index": 0, "finish_reason": finish_reason,
        "message": {"role": "assistant", "content": content}}]})


def make_client(handler, **overrides):
    return TestClient(create_app(make_settings(**overrides), transport=httpx.MockTransport(handler)), base_url="http://localhost")
