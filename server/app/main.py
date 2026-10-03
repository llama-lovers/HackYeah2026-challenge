"""Local proxy factory. Run with uvicorn factory mode and --no-access-log."""

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from app.config import SERVER_DIR, Settings, load_env_file
from app.openrouter import UpstreamError, chat_json
from app.prompts import build_action_messages
from app.schemas import ACTION_SCHEMA, ActionProposal, ActionRequest


def create_app(settings: Settings | None = None,
               transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    if settings is None:
        load_env_file(SERVER_DIR / ".env")
        settings = Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        async with httpx.AsyncClient(base_url=settings.openrouter_base_url.rstrip("/") + "/",
                                    timeout=settings.openrouter_timeout_s, transport=transport) as client:
            app.state.http = client
            yield

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.settings = settings

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.post("/api/action")
    async def action(body: ActionRequest):
        if not settings.openrouter_api_key:
            return JSONResponse({"error": "no_api_key"}, status_code=503)
        try:
            data = await chat_json(app.state.http, settings, schema_name="action_proposal",
                                   schema=ACTION_SCHEMA, messages=build_action_messages(body.utterance, body.snapshot),
                                   max_tokens=settings.action_max_tokens)
            return ActionProposal.model_validate(data).model_dump()
        except ValidationError:
            return JSONResponse({"error": "model_invalid_output"}, status_code=502)
        except UpstreamError as exc:
            return JSONResponse({"error": exc.code}, status_code=502)

    return app
