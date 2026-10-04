"""ASGI entry point: uvicorn app:app (one worker)."""
from server import create_app
app = create_app()
