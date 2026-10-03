"""Pure ASGI access guards with bounded request-local buffering."""

import json
import logging
import time


async def _json_response(send, status: int, payload: dict):
    body = json.dumps(payload).encode()
    await send({"type": "http.response.start", "status": status,
                "headers": [(b"content-type", b"application/json"), (b"content-length", str(len(body)).encode())]})
    await send({"type": "http.response.body", "body": body})


class AccessLogMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        started, status, response_started = time.monotonic(), 500, False
        logger = logging.getLogger("voice_agent.access")
        async def logged_send(message):
            nonlocal status, response_started
            if message["type"] == "http.response.start":
                status, response_started = message["status"], True
            await send(message)
        try:
            await self.app(scope, receive, logged_send)
        except Exception as exc:
            logger.error("unhandled %s on %s %s", type(exc).__name__, scope["method"], scope["path"])
            if not response_started:
                await _json_response(logged_send, 500, {"error": "internal"})
        finally:
            logger.info("%s %s -> %d %dms", scope["method"], scope["path"], status,
                        round((time.monotonic() - started) * 1000))


class OriginGuardMiddleware:
    def __init__(self, app, allowed_origins: set[str]):
        self.app, self.allowed_origins = app, allowed_origins

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            origins = [value.decode("latin-1") for key, value in scope["headers"] if key == b"origin"]
            if any(origin not in self.allowed_origins for origin in origins):
                return await _json_response(send, 403, {"error": "forbidden_origin"})
        await self.app(scope, receive, send)


class BodyLimitMiddleware:
    def __init__(self, app, max_bytes: int):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        lengths = [value for key, value in scope["headers"] if key == b"content-length"]
        if any(value.isdigit() and int(value) > self.max_bytes for value in lengths):
            return await _json_response(send, 413, {"error": "request_too_large"})
        # Validate the entire bounded upload before the route sees any bytes.
        # Cutting a chunked stream into a valid JSON prefix could otherwise spend credit.
        chunks, seen = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            if message["type"] != "http.request":
                continue
            seen += len(message.get("body", b""))
            if seen > self.max_bytes:
                return await _json_response(send, 413, {"error": "request_too_large"})
            chunks.append(message)
            if not message.get("more_body", False):
                break
        messages = iter(chunks)
        async def bounded_receive():
            message = next(messages, None)
            return message if message is not None else await receive()
        await self.app(scope, bounded_receive, send)
