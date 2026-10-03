"""Immutable settings; process environment overrides config.env."""
import math
import os
from dataclasses import dataclass, field, fields
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def read_config(path):
    values = {}
    if not path.exists():
        return values
    for number, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"config.env: invalid line {number}")
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


@dataclass(frozen=True)
class Settings:
    backend: str = "local"
    local_voice: str = "pl_PL-mc_speech-medium"
    model_dir: str = "models"
    length_scale: float = 1.0
    noise_scale: float = 0.85
    noise_w_scale: float = 1.0
    volume: float = 1.0
    normalize_text: bool = False
    host: str = "0.0.0.0"
    port: int = 7001
    max_text_chars: int = 4000
    request_timeout_seconds: float = 60.0
    openrouter_api_key: str = field(default="", repr=False)
    openrouter_model: str = ""
    openrouter_voice: str = ""

    @classmethod
    def from_env(cls, path=None):
        env = {**read_config(Path(path) if path else ROOT / "config.env"), **os.environ}
        # Namespaced TTS_BACKEND is preferred; BACKEND is a convenience alias.
        if "TTS_BACKEND" not in env and "BACKEND" in env:
            env["TTS_BACKEND"] = env["BACKEND"]
        defaults, values = cls(), {}
        for f in fields(cls):
            raw = env.get("TTS_" + f.name.upper())
            if raw is None:
                continue
            default = getattr(defaults, f.name)
            if isinstance(default, bool):
                if raw.lower() not in {"true", "false", "1", "0"}:
                    raise ValueError(f"TTS_{f.name.upper()}: use true/false")
                values[f.name] = raw.lower() in {"true", "1"}
            else:
                values[f.name] = type(default)(raw)
        return cls(**values)

    @property
    def model_path(self):
        directory = Path(self.model_dir)
        if not directory.is_absolute():
            directory = ROOT / directory
        return directory / (self.local_voice + ".onnx")

    @property
    def parameters(self):
        return {key: getattr(self, key) for key in
                ("length_scale", "noise_scale", "noise_w_scale", "volume")}

    def __post_init__(self):
        if self.backend not in {"local", "openrouter", "remote"}:
            raise ValueError("TTS_BACKEND: local, openrouter or remote")
        if not self.local_voice or any(c in self.local_voice for c in "/\\"):
            raise ValueError("TTS_LOCAL_VOICE must be a voice name, not a path")
        for key in ("length_scale", "noise_scale", "noise_w_scale", "volume", "request_timeout_seconds"):
            value = getattr(self, key)
            if not math.isfinite(value) or value < 0 or (key in {"length_scale", "request_timeout_seconds"} and value == 0):
                raise ValueError(f"Invalid TTS_{key.upper()}")
        if not 1 <= self.port <= 65535 or not 1 <= self.max_text_chars <= 20000:
            raise ValueError("Invalid port or text limit")
