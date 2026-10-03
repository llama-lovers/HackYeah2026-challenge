"""Wybór silnika bez importowania NeMo/PyTorch w trybie zdalnym."""


def engine_class(backend):
    if backend == "local":
        from asr import ParakeetEngine
        return ParakeetEngine
    if backend == "openrouter":
        from openrouter_engine import OpenRouterEngine
        return OpenRouterEngine
    raise ValueError("Nieznany ASR_BACKEND")
