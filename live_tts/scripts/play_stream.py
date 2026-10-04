import argparse
import shutil
import subprocess
import time

import httpx


def wait_until_idle(client: httpx.Client, timeout: float = 5.0) -> float:
    started = time.perf_counter()
    deadline = started + timeout

    while time.perf_counter() < deadline:
        health = client.get("/health").raise_for_status().json()

        if not health["busy"]:
            return time.perf_counter() - started

        time.sleep(0.05)

    raise RuntimeError("TTS remained busy after stream cancellation")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "text",
        nargs="?",
        default=(
            "Dzień dobry. To jest test strumieniowego syntezatora mowy. "
            "Za chwilę przeczytam kilka kolejnych zdań. "
            "W dowolnym momencie możesz nacisnąć Control C, "
            "aby natychmiast zatrzymać odtwarzanie. "
            "Po zatrzymaniu sprawdzimy również, "
            "czy silnik jest gotowy na następne zapytanie."
        ),
    )
    parser.add_argument("--url", default="http://127.0.0.1:7001")
    args = parser.parse_args()

    ffplay = shutil.which("ffplay")
    if not ffplay:
        raise SystemExit(
            "Nie znaleziono ffplay.\n"
            "Na macOS zainstaluj:\n"
            "  brew install ffmpeg"
        )

    print("Connecting to TTS...")
    print("Press Ctrl+C to STOP speech.\n")

    with httpx.Client(base_url=args.url, timeout=None) as client:
        health = client.get("/health").raise_for_status().json()

        if not health["ready"]:
            raise RuntimeError("TTS backend is not ready")

        started = time.perf_counter()
        first_audio_at = None
        stopped = False

        with client.stream(
            "POST",
            "/synthesize/stream",
            json={"text": args.text},
        ) as response:
            response.raise_for_status()

            sample_rate = int(response.headers["x-sample-rate"])

            player = subprocess.Popen(
                [
                    ffplay,
                    "-loglevel",
                    "error",
                    "-nodisp",
                    "-autoexit",
                    "-f",
                    "s16le",
                    "-ar",
                    str(sample_rate),
                    "-i",
                    "pipe:0",
                ],
                stdin=subprocess.PIPE,
                start_new_session=True,
            )

            try:
                for chunk in response.iter_bytes():
                    if not chunk:
                        continue

                    if first_audio_at is None:
                        first_audio_at = time.perf_counter()

                        print(
                            "First audio: "
                            f"{(first_audio_at - started) * 1000:.1f} ms"
                        )

                    if player.poll() is not None:
                        break

                    try:
                        player.stdin.write(chunk)
                        player.stdin.flush()
                    except BrokenPipeError:
                        break

            except KeyboardInterrupt:
                stopped = True
                print("\nSTOP requested")

            finally:
                try:
                    if player.stdin:
                        player.stdin.close()
                except BrokenPipeError:
                    pass

                if stopped:
                    # STOP ma być natychmiastowy.
                    if player.poll() is None:
                        player.terminate()

                    try:
                        player.wait(timeout=1)
                    except subprocess.TimeoutExpired:
                        player.kill()
                        player.wait()

                else:
                    try:
                        player.wait(timeout=10)

                    except KeyboardInterrupt:
                        stopped = True
                        print("\nSTOP requested")

                        if player.poll() is None:
                            player.terminate()

                        try:
                            player.wait(timeout=1)
                        except subprocess.TimeoutExpired:
                            player.kill()
                            player.wait()

                    except subprocess.TimeoutExpired:
                        player.terminate()

                        try:
                            player.wait(timeout=1)
                        except subprocess.TimeoutExpired:
                            player.kill()
                            player.wait()

                    if not stopped and player.returncode != 0:
                        raise RuntimeError(
                            f"ffplay exited with code {player.returncode}"
                        )

        recovery = wait_until_idle(client)

        print(f"TTS engine idle after: {recovery * 1000:.1f} ms")

        health = client.get("/health").raise_for_status().json()

        print(f"ready={health['ready']}")
        print(f"busy={health['busy']}")

        if stopped:
            print("Cancellation test: OK")
        else:
            print("Playback completed normally")


if __name__ == "__main__":
    main()