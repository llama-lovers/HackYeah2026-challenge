"""Environment-only proxy configuration; no request data is retained."""

import os
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

SERVER_DIR = Path(__file__).resolve().parents[1]


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
    action_max_tokens: int = 300
    effect_max_tokens: int = 150
    stt_mode: Literal["stub", "whisper"] = "stub"
    stt_stub_text: str = "kliknij Znajdź"
    max_body_bytes: int = 2097152
    extension_id: str | None = None
    allowed_hosts: tuple[str, ...] = ("localhost", "127.0.0.1")
    warmup_on_start: bool = False

    @classmethod
    def from_env(cls, environ=os.environ):
        def value(key, default=None):
            return environ.get(key) or default

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
            stt_mode=mode,
            stt_stub_text=value("STT_STUB_TEXT", cls.stt_stub_text),
            max_body_bytes=int(value("MAX_BODY_BYTES", "2097152")),
            extension_id=value("EXTENSION_ID"),
            allowed_hosts=tuple(dict.fromkeys(("localhost", "127.0.0.1", *[h.strip() for h in value("ALLOWED_HOSTS", "").split(",") if h.strip()]))),
            warmup_on_start=value("WARMUP_ON_START", "").casefold() in {"1", "true"},
        )
