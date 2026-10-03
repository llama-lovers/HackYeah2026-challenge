"""Run locally by default; Docker is optional, unlike the heavy STT runtime."""
import argparse
import logging
import subprocess
from config import ROOT, Settings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", nargs="?", choices=["start", "stop", "logs"], default="start")
    parser.add_argument("--docker", action="store_true")
    args = parser.parse_args()
    if args.docker:
        command = ["docker", "compose"]
        if (ROOT / "config.env").exists():
            command += ["--env-file", "config.env"]
        command += ["-f", "compose.yaml"]
        command += {"start": ["up", "-d", "--build"], "stop": ["down"],
                    "logs": ["logs", "-f", "--tail", "100"]}[args.action]
        return subprocess.call(command, cwd=ROOT)
    if args.action != "start":
        parser.error("stop/logs require --docker; stop local server with Ctrl+C")
    import uvicorn
    from server import create_app
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    cfg = Settings.from_env()
    uvicorn.run(create_app(cfg), host=cfg.host, port=cfg.port, workers=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
