"""CPU audio preparation adapted from jj_whisper's Silero gate and silence cutter."""

from dataclasses import dataclass
import io
import shutil
import subprocess
import threading
import wave

import numpy as np
from pydub import AudioSegment
from pydub.silence import detect_nonsilent

from app.stt import TranscriptionError

SAMPLE_RATE = 16_000
MAX_AUDIO_SECONDS = 60
MAX_SEGMENT_MS = 30_000
_vad_lock = threading.Lock()
_vad_model = None


@dataclass(frozen=True)
class AudioChunk:
    wav: bytes
    start_seconds: float
    # Original VAD ranges relative to this chunk, before adding silence margins.
    speech_ranges: tuple[tuple[float, float], ...]


def _load_vad():
    global _vad_model
    if _vad_model is None:
        from silero_vad import load_silero_vad
        _vad_model = load_silero_vad().eval()  # Bundled weights; no torch.hub downloads.
    return _vad_model


def initialize_audio_processing():
    if shutil.which("ffmpeg") is None:
        raise RuntimeError("Audio preprocessing requires ffmpeg on PATH")
    with _vad_lock:
        _load_vad()


def decode_audio(audio: bytes, fmt: str) -> np.ndarray:
    """Bound decoded duration as well as input size; no shell or temporary files."""
    executable = shutil.which("ffmpeg")
    if executable is None:
        raise TranscriptionError("provider_error")
    try:
        decoded = subprocess.run(
            [executable, "-hide_banner", "-loglevel", "error", "-nostdin",
             "-protocol_whitelist", "pipe", "-f", fmt, "-i", "pipe:0",
             "-t", str(MAX_AUDIO_SECONDS + 0.001), "-vn", "-ac", "1",
             "-ar", str(SAMPLE_RATE), "-f", "s16le", "pipe:1"],
            input=audio, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            timeout=10, check=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        ).stdout
    except subprocess.TimeoutExpired:
        raise TranscriptionError("timeout") from None
    except (OSError, subprocess.CalledProcessError):
        raise TranscriptionError("unsupported_format") from None
    if len(decoded) % 2 or len(decoded) > MAX_AUDIO_SECONDS * SAMPLE_RATE * 2:
        raise TranscriptionError("unsupported_format")
    return np.frombuffer(decoded, dtype="<i2").astype(np.float32) / 32768.0


def detect_speech(samples: np.ndarray) -> list[tuple[int, int]]:
    import torch
    from silero_vad import get_speech_timestamps
    # Silero has recurrent state; simultaneous requests must not share it mid-stream.
    with _vad_lock, torch.inference_mode():
        speech = get_speech_timestamps(
            torch.from_numpy(samples), _load_vad(), sampling_rate=SAMPLE_RATE,
            threshold=0.4, min_speech_duration_ms=200,
            min_silence_duration_ms=200, return_seconds=False,
        )
    return [(part["start"], part["end"]) for part in speech]


def gate_audio(samples: np.ndarray, ranges: list[tuple[int, int]]) -> np.ndarray:
    mask = np.zeros(len(samples), dtype=bool)
    padding = SAMPLE_RATE // 2  # 500 ms, without np.roll's circular wraparound.
    for start, end in ranges:
        mask[max(0, start - padding):min(len(samples), end + padding)] = True
    gated = samples.copy()
    gated[~mask] = np.random.default_rng().normal(0, 1e-5, np.count_nonzero(~mask))
    # Same 10 ms linear fades as the reference, around each gate transition.
    changes = np.diff(mask.astype(np.int8), prepend=int(mask[0]))
    fade = SAMPLE_RATE // 100
    for transition, rising in ((1, True), (-1, False)):
        for index in np.flatnonzero(changes == transition):
            start, end = max(0, index - fade), min(len(samples), index + fade)
            gated[start:end] *= np.linspace(0 if rising else 1, 1 if rising else 0,
                                           end - start, dtype=np.float32)
    return np.clip(gated, -1, 1)


def encode_wav(samples: np.ndarray) -> bytes:
    pcm = np.clip(np.rint(samples * 32768), -32768, 32767).astype("<i2").tobytes()
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm)
    return buffer.getvalue()


def segment_ranges(nonsilent: list[list[int]], duration_ms: int) -> list[tuple[int, int]]:
    """Keep 500 ms context; group spans up to 30 s without duplicating overlaps."""
    groups: list[tuple[int, int]] = []
    for start, end in nonsilent:
        start, end = max(0, start - 500), min(duration_ms, end + 500)
        if groups and (start <= groups[-1][1] or end - groups[-1][0] <= MAX_SEGMENT_MS):
            groups[-1] = (groups[-1][0], max(end, groups[-1][1]))
        else:
            groups.append((start, end))
    # A continuous utterance can exceed 30 s; the reference does not split it.
    return [(start, min(start + MAX_SEGMENT_MS, end))
            for left, end in groups for start in range(left, end, MAX_SEGMENT_MS)]


def prepare_audio(audio: bytes, fmt: str) -> list[AudioChunk]:
    samples = decode_audio(audio, fmt)
    if not len(samples):
        return []
    speech = detect_speech(samples)
    if not speech:
        return []  # Silence never reaches the transcription provider.
    gated = gate_audio(samples, speech)
    pcm = np.clip(np.rint(gated * 32768), -32768, 32767).astype("<i2").tobytes()
    segment = AudioSegment(data=pcm, sample_width=2, frame_rate=SAMPLE_RATE, channels=1)
    nonsilent = detect_nonsilent(segment, min_silence_len=500, silence_thresh=-50)
    chunks = []
    for start_ms, end_ms in segment_ranges(nonsilent, len(segment)):
        start, end = start_ms * 16, min(len(gated), end_ms * 16)
        ranges = tuple(((max(s, start) - start) / SAMPLE_RATE,
                        (min(e, end) - start) / SAMPLE_RATE)
                       for s, e in speech if s < end and e > start)
        if ranges:
            chunks.append(AudioChunk(encode_wav(gated[start:end]), start / SAMPLE_RATE, ranges))
    return chunks
