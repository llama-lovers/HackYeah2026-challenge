FROM python:3.14.7-slim-bookworm AS base
COPY --from=ghcr.io/astral-sh/uv:0.12.19 /uv /uvx /bin/
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
    UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-cache
COPY config.py streaming.py server.py backends.py openrouter_engine.py local_engine.py ./
EXPOSE 7000
HEALTHCHECK --start-period=300s --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import json, urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:7000/ready', timeout=3))['ready']"
CMD ["python", "server.py"]

FROM base AS openrouter
# Lekki wariant; bez NeMo, PyTorch i GPU.

FROM base AS local
ENV NVIDIA_VISIBLE_DEVICES=all NVIDIA_DRIVER_CAPABILITIES=compute,utility \
    UV_PYTHON_INSTALL_DIR=/opt/uv/python \
    LOCAL_PYTHON=/app/local_runtime/.venv/bin/python
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential ffmpeg libsndfile1 sox \
    && rm -rf /var/lib/apt/lists/*
COPY local_runtime/pyproject.toml local_runtime/uv.lock local_runtime/.python-version ./local_runtime/
RUN UV_PYTHON_DOWNLOADS=manual uv python install 3.13.15 \
    && uv sync --project local_runtime --locked --no-dev --no-cache \
    && uv pip check --python /app/local_runtime/.venv/bin/python
COPY asr.py local_worker.py ./
