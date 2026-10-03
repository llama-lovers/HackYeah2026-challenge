"""Konfiguracja serwera przez zmienne środowiskowe."""

import os
from dataclasses import dataclass, fields, field

SAMPLE_RATE = 16_000
FRAME_MS = 20
FRAME_SAMPLES = SAMPLE_RATE * FRAME_MS // 1000
FRAME_BYTES = FRAME_SAMPLES * 2


@dataclass(frozen=True)
class Settings:
    model_name: str = "nvidia/parakeet-tdt-0.6b-v3"
    asr_backend: str = "local"
    openrouter_api_key: str = field(default="", repr=False)
    openrouter_model: str = "nvidia/parakeet-tdt-0.6b-v3"
    request_timeout_seconds: int = 90
    enable_partials: bool = True
    device: str = "cuda"
    partial_interval_ms: int = 800
    min_partial_ms: int = 1000
    end_silence_ms: int = 600
    pre_roll_ms: int = 300
    speech_start_ms: int = 60
    max_segment_ms: int = 20_000
    vad_mode: int = 2
    max_connections: int = 4
    max_pending_segments: int = 4
    max_message_bytes: int = 64_000
    idle_timeout_s: int = 60
    send_timeout_s: int = 15
    word_timestamps: bool = False

    @property
    def active_model(self):
        return self.model_name if self.asr_backend == "local" else self.openrouter_model

    @property
    def partials_enabled(self):
        return self.enable_partials

    @classmethod
    def from_env(cls):
        defaults = cls()
        values = {}
        for field in fields(cls):
            raw = os.getenv(field.name.upper())
            if raw is None:
                continue
            default = getattr(defaults, field.name)
            if isinstance(default, bool):
                if raw.lower() not in {"1", "0", "true", "false"}:
                    raise ValueError(f"{field.name.upper()}: użyj 1/0 lub true/false")
                values[field.name] = raw.lower() in {"1", "true"}
            else:
                values[field.name] = type(default)(raw)
        return cls(**values)

    def __post_init__(self):
        if self.asr_backend not in {"local", "openrouter"}:
            raise ValueError("ASR_BACKEND: użyj local albo openrouter")
        if not 1 <= self.request_timeout_seconds <= 120:
            raise ValueError("REQUEST_TIMEOUT_SECONDS: wymagane 1–120")
        if not self.openrouter_model.strip():
            raise ValueError("OPENROUTER_MODEL nie może być pusty")
        if self.asr_backend == "openrouter" and self.word_timestamps:
            raise ValueError("Dla OpenRouter ustaw WORD_TIMESTAMPS=false")
        for name in ("partial_interval_ms", "min_partial_ms", "end_silence_ms",
                     "pre_roll_ms", "speech_start_ms", "max_segment_ms"):
            value = getattr(self, name)
            if value < FRAME_MS or value % FRAME_MS:
                raise ValueError(f"{name}: wymagana dodatnia wielokrotność {FRAME_MS} ms")
        if self.pre_roll_ms < self.speech_start_ms:
            raise ValueError("PRE_ROLL_MS musi być >= SPEECH_START_MS")
        if self.max_segment_ms <= max(self.min_partial_ms, self.pre_roll_ms, self.end_silence_ms):
            raise ValueError("MAX_SEGMENT_MS musi być większe od bufora początkowego i progów VAD/partial")
        if self.vad_mode not in range(4):
            raise ValueError("VAD_MODE: dozwolone 0, 1, 2, 3")
        for name in ("max_connections", "max_pending_segments", "max_message_bytes",
                     "idle_timeout_s", "send_timeout_s"):
            if getattr(self, name) <= 0:
                raise ValueError(f"{name} musi być dodatnie")
        if not self.model_name or not self.device:
            raise ValueError("MODEL_NAME i DEVICE nie mogą być puste")
