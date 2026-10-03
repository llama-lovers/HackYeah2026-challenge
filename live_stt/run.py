"""Uruchamianie obu trybów tą samą komendą; Python 3.14 zarządzany przez uv."""
import argparse
import os
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def read_config(path):
    values = {}
    for number, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"config.env: nieprawidłowy wiersz {number}")
        key, value = line.split("=", 1)
        key, value = key.strip(), value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key] = value
    return values


def compose_command(values, action):
    backend = values.get("ASR_BACKEND", "openrouter")
    if backend not in {"local", "openrouter"}:
        raise ValueError("ASR_BACKEND musi być local albo openrouter")
    device = values.get("DEVICE", "cuda")
    if backend == "local" and device not in {"cuda", "cuda:0", "cpu"}:
        raise ValueError("DEVICE: użyj cuda, cuda:0 albo cpu")
    if action == "start" and backend == "openrouter":
        key = values.get("OPENROUTER_API_KEY", "").strip()
        if not key or key == "TU_WKLEJ_KLUCZ_OPENROUTER":
            raise ValueError("Wpisz OPENROUTER_API_KEY w config.env")
    cmd = ["docker", "compose", "--env-file", "config.env", "-f", "compose.yaml"]
    if backend == "local" and device.startswith("cuda"):
        cmd.extend(["-f", "compose.gpu.yaml"])
    cmd.extend({
        "start": ["up", "-d", "--build", "--force-recreate"],
        "stop": ["down"],
        "logs": ["logs", "-f", "--tail", "100"],
    }[action])
    return cmd


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=["start", "stop", "logs"], nargs="?", default="start")
    args = parser.parse_args()
    try:
        values = read_config(ROOT / "config.env")
        cmd = compose_command(values, args.action)
        # config.env jest źródłem ustawień także dla interpolacji Compose.
        env = dict(os.environ)
        env.update(values)
        print(f"ASR_BACKEND={values.get('ASR_BACKEND', 'openrouter')}", flush=True)
        return subprocess.call(cmd, cwd=ROOT, env=env)
    except FileNotFoundError:
        print("Brak config.env lub polecenia docker. Skopiuj env.example do config.env, uzupełnij ustawienia i sprawdź instalację Docker.", file=sys.stderr)
        return 1
    except (ValueError, OSError) as exc:
        print(f"Błąd: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
