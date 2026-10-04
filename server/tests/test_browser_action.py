import logging

import httpx
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def test_browser_events_are_logged_without_a_model_call(caplog):
    def no_upstream(request):
        raise AssertionError("browser events must not call a model")

    app = create_app(Settings(extension_id="a" * 32), transport=httpx.MockTransport(no_upstream))
    with TestClient(app, base_url="http://localhost") as client, caplog.at_level(logging.INFO):
        response = client.post("/api/browser-action", json={"kind": "search", "stage": "started", "turn_id": "test-turn"})
    assert response.status_code == 200
    assert response.json() == {"ok": True}
    assert "browser action search -> started turn=test-turn" in caplog.text


def test_browser_event_rejects_query_data_and_unbounded_or_invalid_events():
    with TestClient(create_app(Settings(extension_id="a" * 32)), base_url="http://localhost") as client:
        valid = {"kind": "search", "stage": "started", "turn_id": "test-turn"}
        for body in [dict(valid, query="private"), dict(valid, kind="execute"), dict(valid, stage="done"),
                     dict(valid, turn_id="x" * 65), dict(valid, turn_id="newline\n")]:
            assert client.post("/api/browser-action", json=body).status_code == 422
