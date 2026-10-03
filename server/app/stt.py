"""Frozen synchronous seam owned by the Whisper integration teammate."""

TRANSCRIPTION_ERROR_CODES = frozenset({"provider_error", "timeout", "unsupported_format"})


class TranscriptionError(Exception):
    def __init__(self, code: str):
        self.code = code if code in TRANSCRIPTION_ERROR_CODES else "provider_error"
        super().__init__(self.code)


def transcribe(audio_bytes: bytes, mime: str) -> str:
    """Return raw Polish text without number normalization; silence returns "".

    Provider failures raise TranscriptionError(code). The teammate implementation
    POSTs to https://openrouter.ai/api/v1/audio/transcriptions using
    openai/whisper-large-v3-turbo (fallback openai/whisper-1), language "pl", a
    10 s timeout and OPENROUTER_API_KEY from the environment. Never log or persist
    audio or transcripts. Called from a worker thread, never the event loop.
    """
    try:
        from app.stt_whisper import transcribe_whisper
    except ImportError:
        raise TranscriptionError("provider_error") from None
    return transcribe_whisper(audio_bytes, mime)
