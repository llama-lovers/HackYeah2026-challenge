"""Prywatny proces NeMo; uruchamiany przez LocalWorkerEngine, bez portu HTTP."""
import asyncio
import base64
import json
import logging
import os
import sys


async def main():
    # Wydziel protokół, a wszelkie wydruki NeMo (także z bibliotek C) skieruj do logów.
    protocol = os.fdopen(os.dup(sys.stdout.fileno()), "w", buffering=1, encoding="utf-8")
    os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    sys.stdout = sys.stderr
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [local] %(message)s")
    engine = None

    def send(payload):
        protocol.write(json.dumps(payload) + "\n")
        protocol.flush()

    try:
        command = json.loads(sys.stdin.readline())
        if command.get("type") != "start":
            raise ValueError("Oczekiwano start")
        from config import Settings
        from asr import ParakeetEngine
        from streaming import DecodeJob
        engine = ParakeetEngine(Settings(**command["settings"]))
        await engine.start()
        send({"type": "ready", "python": sys.version.split()[0]})
        while line := sys.stdin.readline():
            try:
                command = json.loads(line)
                if command.get("type") != "transcribe":
                    raise ValueError("Nieznana komenda procesu modelu")
                job = command["job"]
                job["pcm"] = base64.b64decode(job["pcm"], validate=True)
                result = await engine.transcribe(DecodeJob(**job))
                send({"type": "result", "result": result})
            except Exception as exc:
                logging.exception("Błąd lokalnej transkrypcji")
                send({"type": "error", "message": str(exc)})
    except Exception as exc:
        logging.exception("Błąd uruchomienia lokalnego modelu")
        send({"type": "error", "message": str(exc)})
    finally:
        if engine is not None:
            await engine.close()
        protocol.close()


if __name__ == "__main__":
    asyncio.run(main())
