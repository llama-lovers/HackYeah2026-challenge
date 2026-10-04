"""Environment-only proxy configuration; no request data is retained."""

import os
import base64
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

SERVER_DIR = Path(__file__).resolve().parents[1]


def extension_id_from_key(key_b64: str) -> str:
    digest = hashlib.sha256(base64.b64decode(key_b64, validate=True)).hexdigest()[:32]
    return "".join(chr(ord("a") + int(char, 16)) for char in digest)


def resolve_extension_id(environ, manifest_path: Path) -> str | None:
    extension_id = environ.get("EXTENSION_ID")
    if extension_id:
        if not re.fullmatch(r"[a-p]{32}", extension_id):
            raise ValueError("invalid_extension_id")
        return extension_id
    if not manifest_path.is_file():
        return None
    try:
        key = json.loads(manifest_path.read_text()).get("key")
        return extension_id_from_key(key) if key else None
    except (ValueError, TypeError, AttributeError):
        raise ValueError("invalid_manifest_key") from None


def load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = (part.strip() for part in line.split("=", 1))
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if key and value and key not in os.environ:
            os.environ[key] = value


@dataclass(frozen=True)
class Settings:
    openrouter_api_key: str | None = None
    chat_model: str = "anthropic/claude-sonnet-5.5"
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_timeout_s: float = 15.0
    action_max_tokens: int = 4096
    effect_max_tokens: int = 2048
    explore_max_tokens: int = 4096
    stt_mode: Literal["stub", "whisper"] = "stub"
    stt_stub_text: str = "kliknij Znajdź"
    max_body_bytes: int = 2097152
    extension_id: str | None = None
    allowed_hosts: tuple[str, ...] = ("localhost", "127.0.0.1")
    warmup_on_start: bool = False
    tts_base_url: str = "http://127.0.0.1:7001"

    @classmethod
    def from_env(cls, environ=os.environ):
        def value(key, default=None):
            return environ.get(key) or default

        def token_limit(key, default):
            limit = int(value(key, str(default)))
            if not 256 <= limit <= 16384:
                raise ValueError("invalid_token_limit")
            return limit

        model = value("CHAT_MODEL", cls.chat_model)
        mode = value("STT_MODE", "stub")
        if model.startswith("~") or "latest" in model.casefold():
            raise ValueError("invalid_chat_model")
        if mode not in {"stub", "whisper"}:
            raise ValueError("invalid_stt_mode")
        return cls(
            openrouter_api_key=value("OPENROUTER_API_KEY"),
            chat_model=model,
            openrouter_base_url=value("OPENROUTER_BASE_URL", cls.openrouter_base_url),
            openrouter_timeout_s=float(value("OPENROUTER_TIMEOUT_S", "15")),
            action_max_tokens=token_limit("ACTION_MAX_TOKENS", cls.action_max_tokens),
            effect_max_tokens=token_limit("EFFECT_MAX_TOKENS", cls.effect_max_tokens),
            explore_max_tokens=token_limit("EXPLORE_MAX_TOKENS", cls.explore_max_tokens),
            stt_mode=mode,
            stt_stub_text=value("STT_STUB_TEXT", cls.stt_stub_text),
            max_body_bytes=int(value("MAX_BODY_BYTES", "2097152")),
            extension_id=resolve_extension_id(environ, SERVER_DIR.parent / "extension" / "static" / "manifest.json"),
            allowed_hosts=tuple(dict.fromkeys(("localhost", "127.0.0.1", *[h.strip() for h in value("ALLOWED_HOSTS", "").split(",") if h.strip()]))),
            warmup_on_start=value("WARMUP_ON_START", "").casefold() in {"1", "true"},
            tts_base_url=value("TTS_BASE_URL", cls.tts_base_url),
        )
