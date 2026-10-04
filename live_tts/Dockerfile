FROM python:3.12-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.11.16 /uv /bin/uv
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 UV_LINK_MODE=copy
WORKDIR /app
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-cache
COPY *.py ./
COPY scripts ./scripts
RUN mkdir -p models
EXPOSE 7001
HEALTHCHECK --start-period=30s --interval=30s --timeout=5s \
    CMD /app/.venv/bin/python -c "import json,urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:7001/ready',timeout=3))['ready']"
CMD ["/app/.venv/bin/python", "run.py"]
