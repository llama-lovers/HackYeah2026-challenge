"""Download only the selected voice with Piper's official downloader."""
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from config import Settings

if __name__ == "__main__":
    cfg = Settings.from_env()
    subprocess.run([sys.executable, "-m", "piper.download_voices", "--download-dir",
                    str(cfg.model_path.parent), cfg.local_voice], check=True)
