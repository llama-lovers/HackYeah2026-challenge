"""Small common interface; remote mode never imports Piper."""
from typing import AsyncIterator, Protocol


class TTSBackend(Protocol):
    ready: bool
    media_type: str
    encoding: str
    sample_rate: int | None
    load_count: int
    model_load_time: float

    async def start(self) -> None: ...
    def synthesize_stream(self, text: str) -> AsyncIterator[bytes]: ...
    async def close(self) -> None: ...


def engine_class(backend):
    if backend == "local":
        from local_engine import LocalEngine
        return LocalEngine
    if backend == "openrouter":
        from remote_engine import OpenRouterEngine
        return OpenRouterEngine
    raise ValueError("remote is an extension point, not a configured provider; use local or openrouter")
