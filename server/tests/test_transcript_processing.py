import pytest

from app.transcript_processing import postprocess_transcript

RANGES = ((0.5, 2.0),)


@pytest.mark.parametrize("metadata,expected", [
    ({"avg_logprob": -1}, ""), ({"avg_logprob": -1.1}, ""),
    ({"avg_logprob": -0.99}, "dwadzieścia trzy"),
    ({"compression_ratio": 5}, ""), ({"compression_ratio": 4.99}, "dwadzieścia trzy"),
    ({"language": "ru"}, ""), ({"language": "polish"}, "dwadzieścia trzy"),
    ({}, "dwadzieścia trzy"),
])
def test_reference_quality_thresholds(metadata, expected):
    result = {"text": "dwadzieścia trzy", "segments": [{"text": "dwadzieścia trzy", **metadata}]}
    assert postprocess_transcript(result, RANGES) == expected


def test_filters_words_outside_speech_without_changing_numbers():
    result = {"text": "niechciane dwadzieścia trzy 42", "language": "pl", "segments": [
        {"text": "niechciane dwadzieścia trzy 42", "words": [
            {"word": "niechciane", "start": 0, "end": 0.1},
            {"word": " dwadzieścia", "start": 0.5, "end": 1},
            {"word": " trzy", "start": 1, "end": 1.5},
            {"word": " 42", "start": 1.5, "end": 2},
        ]}]}
    assert postprocess_transcript(result, RANGES) == "dwadzieścia trzy 42"


def test_top_level_words_respect_rejected_segments_and_punctuation():
    result = {"text": "kliknij tutaj. błędne", "language": "Polish",
        "segments": [{"text": "kliknij tutaj.", "start": 0.5, "end": 1.5, "avg_logprob": -0.1},
                     {"text": "błędne", "start": 1.5, "end": 2, "avg_logprob": -2}],
        "words": [{"word": "kliknij", "start": 0.5, "end": 1},
                  {"word": "tutaj.", "start": 1, "end": 1.5},
                  {"word": "błędne", "start": 1.5, "end": 2}]}
    assert postprocess_transcript(result, RANGES) == "kliknij tutaj."


def test_plain_response_preserves_words_and_existing_digits():
    assert postprocess_transcript({"text": "  wpisz dwadzieścia trzy i 42\n"}, RANGES) == "wpisz dwadzieścia trzy i 42"


def test_words_only_response():
    result = {"text": "jeden szum", "words": [
        {"word": "jeden", "end": 1}, {"word": "szum", "end": 5}]}
    assert postprocess_transcript(result, RANGES) == "jeden"


def test_all_rejected_segments_do_not_fall_back_to_unfiltered_text():
    assert postprocess_transcript({"text": "błędne", "segments": [{"text": "błędne", "avg_logprob": -2}]}, RANGES) == ""


def test_word_window_matches_reference_tolerance():
    result = {"text": "przed po daleko", "words": [
        {"word": "przed", "end": 0.3}, {"word": "po", "end": 2.05}, {"word": "daleko", "end": 2.2}]}
    assert postprocess_transcript(result, RANGES) == "przed po"


@pytest.mark.parametrize("number", [
    "789-01234", "789 -01234", "789- 01234", "789 - 01234",
    "789\u201001234", "789\u201101234", "789\u201201234", "789 \u2013 01234", "789 \u2014 01234",
    "789 - 01 - 234",
])
def test_merges_hyphenated_digit_groups(number):
    result = {"text": f"Wpisz {number} w pole numeru przesyłki."}
    assert postprocess_transcript(result, RANGES) == "Wpisz 78901234 w pole numeru przesyłki."


@pytest.mark.parametrize("structure", ["words", "segment_words", "segments", "top_level_words"])
def test_merges_numbers_across_tokens_and_segments(structure):
    parts = ["Wpisz", "789", "-", "01234", "w pole."]
    words = [{"word": part, "start": 0.5 + i * 0.2, "end": 0.7 + i * 0.2}
             for i, part in enumerate(parts)]
    result = {"text": "Wpisz 789 -01234 w pole."}
    if structure == "words":
        result["words"] = words
    elif structure == "segment_words":
        result["segments"] = [{"text": result["text"], "words": words}]
    elif structure == "segments":
        result["segments"] = [{"text": part} for part in parts]
    else:
        result["segments"] = [{"text": result["text"], "start": 0.5, "end": 2}]
        result["words"] = words
    assert postprocess_transcript(result, RANGES) == "Wpisz 78901234 w pole."


def test_number_merging_preserves_other_text_and_leading_zeros():
    result = {"text": "polsko-angielski -12 dwadzieścia trzy 789 01234 ABC-123 001 - 002."}
    assert postprocess_transcript(result, RANGES) == "polsko-angielski -12 dwadzieścia trzy 789 01234 ABC-123 001002."


def test_number_merging_does_not_restore_filtered_words():
    result = {"text": "789 -01234", "words": [
        {"word": "789", "end": 1}, {"word": "-01234", "end": 5}]}
    assert postprocess_transcript(result, RANGES) == "789"
