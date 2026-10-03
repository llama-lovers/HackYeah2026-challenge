"""Wybór silnika bez importowania NeMo/PyTorch w trybie zdalnym."""


def engine_class(backend):
    if backend == "local":
        from local_engine import LocalWorkerEngine
        return LocalWorkerEngine
    if backend == "openrouter":
        from openrouter_engine import OpenRouterEngine
        return OpenRouterEngine
    raise ValueError("Nieznany ASR_BACKEND")
