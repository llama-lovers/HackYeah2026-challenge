"""Ramkowanie PCM, wykrywanie wypowiedzi i kolejka najnowszych hipotez."""

import asyncio
from collections import deque
from dataclasses import dataclass
from typing import Callable

from config import FRAME_BYTES, FRAME_MS, SAMPLE_RATE, Settings


class StreamError(Exception):
    def __init__(self, message: str, code: int = 1008):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class DecodeJob:
    segment_id: int
    start_sample: int
    end_sample: int
    pcm: bytes
    final: bool = False
    reason: str | None = None


class DecodeMailbox:
    """Nie kumuluje starych partial. Zachowuje kolejność i wszystkie final."""

    def __init__(self, limit: int):
        self.limit = limit
        self.jobs: deque[DecodeJob] = deque()
        self.changed = asyncio.Event()
        self.closed = False

    def put(self, job: DecodeJob):
        if self.closed:
            raise RuntimeError("Kolejka jest zamknięta")
        if self.jobs and self.jobs[-1].segment_id == job.segment_id:
            if self.jobs[-1].final:
                raise RuntimeError("Wynik po finalizacji segmentu")
            self.jobs[-1] = job
        else:
            if len(self.jobs) >= self.limit:
                raise StreamError("Serwer nie nadąża z transkrypcją. Zmniejsz liczbę połączeń "
                                  "lub wysyłaj audio w tempie rzeczywistym.", 1013)
            self.jobs.append(job)
        self.changed.set()

    async def get(self) -> DecodeJob | None:
        while not self.jobs:
            if self.closed:
                return None
            self.changed.clear()
            await self.changed.wait()
        return self.jobs.popleft()

    def close(self):
        self.closed = True
        self.changed.set()


class Segmenter:
    def __init__(self, settings: Settings, is_speech: Callable[[bytes], bool],
                 emit: Callable[[DecodeJob], None]):
        self.cfg = settings
        self.is_speech = is_speech
        self.emit = emit
        self.pending = bytearray()
        self.pre_roll: deque[tuple[int, bytes]] = deque(maxlen=settings.pre_roll_ms // FRAME_MS)
        self.cursor = 0
        self.segment_id = 0
        self.active = False
        self.audio = bytearray()
        self.start = 0
        self.speech_frames = 0
        self.silent_samples = 0
        self.last_partial = 0

    def feed(self, data: bytes):
        # Granice wiadomości WebSocket nie muszą pokrywać się z ramkami VAD.
        self.pending.extend(data)
        while len(self.pending) >= FRAME_BYTES:
            frame = bytes(self.pending[:FRAME_BYTES])
            del self.pending[:FRAME_BYTES]
            self._frame(frame)

    def _frame(self, frame: bytes):
        speech = self.is_speech(frame.ljust(FRAME_BYTES, b"\0"))
        frame_start = self.cursor
        sample_count = len(frame) // 2
        self.cursor += sample_count

        if not self.active:
            self.pre_roll.append((frame_start, frame))
            self.speech_frames = self.speech_frames + 1 if speech else 0
            if self.speech_frames * FRAME_MS < self.cfg.speech_start_ms:
                return
            self.active = True
            self.segment_id += 1
            self.start = self.pre_roll[0][0]
            self.audio = bytearray(b"".join(part for _, part in self.pre_roll))
            self.pre_roll.clear()
            self.silent_samples = 0
            self.last_partial = self.start
        else:
            self.audio.extend(frame)
            self.silent_samples = 0 if speech else self.silent_samples + sample_count

        duration_ms = (self.cursor - self.start) * 1000 / SAMPLE_RATE
        if self.silent_samples * 1000 / SAMPLE_RATE >= self.cfg.end_silence_ms:
            self._final("silence")
        elif duration_ms >= self.cfg.max_segment_ms:
            self._final("max_duration")
        elif (self.cfg.partials_enabled and duration_ms >= self.cfg.min_partial_ms and
              (self.cursor - self.last_partial) * 1000 / SAMPLE_RATE >= self.cfg.partial_interval_ms):
            self.emit(self._job())
            self.last_partial = self.cursor

    def _job(self, final: bool = False, reason: str | None = None):
        return DecodeJob(self.segment_id, self.start, self.cursor, bytes(self.audio), final, reason)

    def _final(self, reason: str):
        self.emit(self._job(final=True, reason=reason))
        self.active = False
        self.audio.clear()
        self.pre_roll.clear()
        self.speech_frames = 0
        self.silent_samples = 0

    def finish(self, reason: str = "end"):
        if len(self.pending) % 2:
            raise StreamError("Niepełna próbka PCM16: łączna liczba bajtów musi być parzysta.")
        if self.pending:
            remainder = bytes(self.pending)
            self.pending.clear()
            # Do VAD trafia ramka dopełniona zerami, do modelu tylko rzeczywiste próbki.
            self._frame(remainder)
        if self.active:
            self._final(reason)
        self.pre_roll.clear()
        self.speech_frames = 0
