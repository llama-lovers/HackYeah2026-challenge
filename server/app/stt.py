"""Frozen synchronous seam owned by the Whisper integration teammate."""

TRANSCRIPTION_ERROR_CODES = frozenset({"provider_error", "timeout", "unsupported_format"})


class TranscriptionError(Exception):
    def __init__(self, code: str):
        self.code = code if code in TRANSCRIPTION_ERROR_CODES else "provider_error"
        super().__init__(self.code)


def transcribe(audio_bytes: bytes, mime: str) -> str:
    """Return filtered Polish text without number normalization; silence returns "".

    Provider failures raise TranscriptionError(code). The teammate implementation
    POSTs to https://openrouter.ai/api/v1/audio/transcriptions using
    STT_MODEL (default openai/whisper-large-v3-turbo), language "pl", a
    10 s timeout per chunk and OPENROUTER_API_KEY from the environment. Audio
    is prepared using Silero VAD and silence trimming before upload, and persisted
    only when STT_AUDIO_DEBUG_DIR enables local debugging; transcripts are never
    persisted here. Called from a worker thread, never the event loop.
    """
    try:
        from app.stt_whisper import transcribe_whisper
    except ImportError:
        raise TranscriptionError("provider_error") from None
    return transcribe_whisper(audio_bytes, mime)
