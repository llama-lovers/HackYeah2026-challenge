"""Local proxy factory. Run with uvicorn factory mode and --no-access-log."""

from contextlib import asynccontextmanager
import logging

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from starlette.concurrency import run_in_threadpool
from starlette.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.staticfiles import StaticFiles

from app import stt
from app.audio_processing import initialize_audio_processing
from app.config import SERVER_DIR, Settings, load_env_file
from app.middleware import AccessLogMiddleware, BodyLimitMiddleware, OriginGuardMiddleware
from app.exploration import EXPLORATION_SCHEMA, ExplorationRequest, build_exploration_messages, validate_exploration_output
from app.openrouter import UpstreamError, chat_json, warm_up
from app.prompts import build_action_messages, build_effect_messages
from app.schemas import ACTION_SCHEMA, EFFECT_SCHEMA, ActionProposal, ActionRequest, BrowserActionEvent, EffectRequest, EffectSummary


def create_app(settings: Settings | None = None,
               transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    # HTTPX's own informational logs include URLs; only our safe access log is used.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logger = logging.getLogger("voice_agent.startup")
    if settings is None:
        load_env_file(SERVER_DIR / ".env")
        settings = Settings.from_env()

    @asynccontextmanager
    async def lifespan(app):
        if settings.stt_mode == "whisper":
            await run_in_threadpool(initialize_audio_processing)
            logger.info("Audio preprocessing ready: Silero VAD on CPU, mono 16 kHz WAV")
        if settings.extension_id:
            logger.info("extension origin: chrome-extension://%s", settings.extension_id)
        else:
            logger.warning("EXTENSION_ID unresolved: all browser origins will be rejected")
        async with httpx.AsyncClient(base_url=settings.openrouter_base_url.rstrip("/") + "/",
                                    timeout=settings.openrouter_timeout_s, transport=transport) as client:
            app.state.http = client
            if settings.warmup_on_start and settings.openrouter_api_key:
                for name, result in (await warm_up(client, settings)).items():
                    logger.info("warmup %s -> %s", name, result)
            yield

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.settings = settings
    ext_origin = "chrome-extension://" + settings.extension_id if settings.extension_id else None
    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.max_body_bytes)
    app.add_middleware(CORSMiddleware, allow_origins=[ext_origin] if ext_origin else [], allow_methods=["GET", "POST"], allow_headers=["content-type"])
    app.add_middleware(OriginGuardMiddleware, allowed_origins={ext_origin} if ext_origin else set())
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=list(settings.allowed_hosts))
    app.add_middleware(AccessLogMiddleware)
    app.mount("/fixtures", StaticFiles(directory=SERVER_DIR / "fixtures", check_dir=False, html=False))

    @app.exception_handler(RequestValidationError)
    async def invalid_request(request: Request, exc: RequestValidationError):
        return JSONResponse({"error": "invalid_request", "fields": [".".join(str(part) for part in err["loc"]) for err in exc.errors()]}, status_code=422)

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.post("/api/browser-action")
    async def browser_action(body: BrowserActionEvent):
        # Local browser navigation bypasses the action model. Log typed lifecycle
        # events so it remains visible without retaining queries or page contents.
        logging.getLogger("voice_agent.browser").info("browser action %s -> %s turn=%s", body.kind, body.stage, body.turn_id)
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

    @app.post("/api/effect")
    async def effect(body: EffectRequest):
        if not settings.openrouter_api_key:
            return JSONResponse({"error": "no_api_key"}, status_code=503)
        try:
            data = await chat_json(app.state.http, settings, schema_name="effect_summary",
                                   schema=EFFECT_SCHEMA, messages=build_effect_messages(body.action, body.diff, body.verbosity),
                                   max_tokens=settings.effect_max_tokens)
            return EffectSummary.model_validate(data).model_dump()
        except ValidationError:
            return JSONResponse({"error": "model_invalid_output"}, status_code=502)
        except UpstreamError as exc:
            return JSONResponse({"error": exc.code}, status_code=502)

    @app.post("/api/explore")
    async def explore(body: ExplorationRequest):
        if not settings.openrouter_api_key:
            return JSONResponse({"error": "no_api_key"}, status_code=503)
        try:
            data = await chat_json(app.state.http, settings, schema_name="page_exploration",
                                   schema=EXPLORATION_SCHEMA, messages=build_exploration_messages(body),
                                   max_tokens=settings.explore_max_tokens)
            return validate_exploration_output(body, data).model_dump()
        except ValueError:  # includes pydantic.ValidationError: never relay unvalidated model output
            return JSONResponse({"error": "model_invalid_output"}, status_code=502)
        except UpstreamError as exc:
            return JSONResponse({"error": exc.code}, status_code=502)

    @app.post("/api/transcribe")
    async def transcribe(request: Request):
        mime = request.headers.get("content-type", "")
        if not mime.casefold().startswith("audio/"):
            return JSONResponse({"error": "unsupported_media_type"}, status_code=415)
        audio = await request.body()
        if not audio:
            return JSONResponse({"error": "empty_audio"}, status_code=400)
        if settings.stt_mode == "stub":
            return {"text": request.query_params.get("text", settings.stt_stub_text)}
        try:
            return {"text": await run_in_threadpool(stt.transcribe, audio, mime)}
        except stt.TranscriptionError as exc:
            logging.getLogger("voice_agent.stt").warning("%s %s", type(exc).__name__, exc.code)
            return JSONResponse({"error": exc.code}, status_code=504 if exc.code == "timeout" else 502)
        except Exception as exc:
            logging.getLogger("voice_agent.stt").warning("%s provider_error", type(exc).__name__)
            return JSONResponse({"error": "provider_error"}, status_code=502)

    return app
