"""One stateless, strict-schema completion per call."""

import json

import httpx

from app.config import Settings


class UpstreamError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


async def chat_json(client: httpx.AsyncClient, settings: Settings, *, schema_name: str,
                    schema: dict, messages: list[dict], max_tokens: int) -> dict:
    try:
        response = await client.post("chat/completions", headers={
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "X-OpenRouter-Title": "Glosowy agent HackYeah",
        }, json={
            "model": settings.chat_model, "messages": messages,
            "response_format": {"type": "json_schema", "json_schema": {
                "name": schema_name, "strict": True, "schema": schema,
            }},
            "provider": {"require_parameters": True}, "temperature": 0,
            "max_tokens": max_tokens, "stream": False,
        })
    except httpx.TimeoutException:
        raise UpstreamError("upstream_timeout") from None
    except httpx.RequestError:
        raise UpstreamError("upstream_unreachable") from None
    if response.status_code >= 400:
        raise UpstreamError(f"upstream_{response.status_code}")
    try:
        choice = response.json()["choices"][0]
        if choice.get("finish_reason") == "length":
            raise UpstreamError("model_truncated")
        content = choice["message"]["content"]
        if not isinstance(content, str):
            raise ValueError
        data = json.loads(content)
        if not isinstance(data, dict):
            raise ValueError
        return data
    except (ValueError, KeyError, IndexError, TypeError, AttributeError):
        raise UpstreamError("model_invalid_output") from None


async def warm_up(client, settings) -> dict[str, str]:
    from app.prompts import build_action_messages, build_effect_messages
    from app.schemas import ACTION_SCHEMA, EFFECT_SCHEMA, ExecutedAction, PageDiffModel
    calls = [
        ("action_proposal", ACTION_SCHEMA, build_action_messages("kliknij Znajdź", 'button e1 "Znajdź"')),
        ("effect_summary", EFFECT_SCHEMA, build_effect_messages(ExecutedAction(kind="click", name="Znajdź", role="button"), PageDiffModel())),
    ]
    results = {}
    for name, schema, messages in calls:
        try:
            await chat_json(client, settings, schema_name=name, schema=schema, messages=messages, max_tokens=50)
            results[name] = "ok"
        except UpstreamError as exc:
            results[name] = exc.code
        except Exception:
            results[name] = "model_invalid_output"
    return results
