"""Reference quality and speech-overlap filters, without words-to-digits conversion."""

import logging
import math

from app.stt import TranscriptionError

LANGUAGES = {"en", "de", "pl", "cs", "sk", "lt", "uk"}
LANGUAGE_NAMES = dict(zip(
    ("english", "german", "polish", "czech", "slovak", "lithuanian", "ukrainian"),
    ("en", "de", "pl", "cs", "sk", "lt", "uk"),
))
logger = logging.getLogger("voice_agent.stt")


def _number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _allowed_language(language):
    if language is None:
        return True  # No metadata is different from an unsupported language.
    if not isinstance(language, str):
        return False
    language = language.strip().casefold()
    return LANGUAGE_NAMES.get(language, language) in LANGUAGES


def _join(parts):
    # Whisper tokens normally carry leading spaces; OpenRouter words may not.
    text = ""
    for part in parts:
        if text and part and not text[-1].isspace() and not part[0].isspace() and part[0] not in ",.!?;:)]}":
            text += " "
        text += part
    return text.strip()


def _filter_words(words, speech_ranges):
    kept = []
    for word in words:
        if not isinstance(word, dict):
            raise TranscriptionError("provider_error")
        text, end = word.get("word"), word.get("end")
        if not isinstance(text, str) or not _number(end):
            raise TranscriptionError("provider_error")
        # Reference uses a 75 ms / 250 ms window around each word's end.
        if any(start < end + 0.250 and finish > end - 0.075 for start, finish in speech_ranges):
            kept.append(text)
    return _join(kept)


def postprocess_transcript(result: dict, speech_ranges: tuple[tuple[float, float], ...]) -> str:
    if not _allowed_language(result.get("language")):
        return ""
    segments = result.get("segments")
    words = result.get("words")
    if segments is None:
        if isinstance(words, list):
            return _filter_words(words, speech_ranges)
        logger.info("STT response has no segments or word timestamps; quality filters unavailable")
        return result["text"].strip()
    if not isinstance(segments, list):
        raise TranscriptionError("provider_error")
    texts = []
    for segment in segments:
        if not isinstance(segment, dict) or not isinstance(segment.get("text"), str):
            raise TranscriptionError("provider_error")
        logprob, compression = segment.get("avg_logprob"), segment.get("compression_ratio")
        if ((_number(logprob) and logprob <= -1) or
                (_number(compression) and compression >= 5) or
                not _allowed_language(segment.get("language", result.get("language")))):
            continue
        segment_words = segment.get("words")
        if segment_words is None and isinstance(words, list):
            start, end = segment.get("start"), segment.get("end")
            if _number(start) and _number(end):
                segment_words = [word for word in words if isinstance(word, dict)
                                 and _number(word.get("start")) and _number(word.get("end"))
                                 and start <= (word["start"] + word["end"]) / 2 < end]
        if isinstance(segment_words, list):
            texts.append(_filter_words(segment_words, speech_ranges))
        else:
            texts.append(segment["text"])
    return _join(texts)
