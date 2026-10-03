FROM python:3.11-slim-bookworm AS base
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements-api.txt ./
RUN python -m pip install -r requirements-api.txt
COPY config.py streaming.py server.py backends.py openrouter_engine.py ./
EXPOSE 7000
HEALTHCHECK --start-period=300s --interval=30s --timeout=5s --retries=3 \
    CMD python -c "import json, urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:7000/ready', timeout=3))['ready']"
CMD ["python", "server.py"]

FROM base AS openrouter
# Ten etap nie instaluje NeMo, PyTorch ani CUDA i nie wymaga GPU.

FROM base AS local
ENV NVIDIA_VISIBLE_DEVICES=all NVIDIA_DRIVER_CAPABILITIES=compute,utility
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential git ffmpeg libsndfile1 sox \
    && rm -rf /var/lib/apt/lists/*
COPY requirements-server.txt ./
RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install torch==2.8.0 torchaudio==2.8.0 --index-url https://download.pytorch.org/whl/cu128 \
    && python -m pip install -r requirements-server.txt \
    && python -m pip check
COPY asr.py ./
