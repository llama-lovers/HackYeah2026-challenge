import pytest
from text_normalizer import normalize_text


@pytest.mark.parametrize("text", ["Dzień dobry, w czym mogę pomóc?", "2 bilety", "2 wiadomości", "00123", "31-571", "2.4.1", "kontakt@example.com", "https://example.com/04.10.2026?x=50%", "31.02.2026", "25:75", "2 https://example.com", "Zwykły tekst..."])
def test_preserve(text):
    assert normalize_text(text) == text


def test_numbers_currency_percent():
    assert normalize_text("22") == "dwadzieścia dwa"
    assert normalize_text("50%") == "pięćdziesiąt procent"
    assert "dwieście czterdzieści dziewięć złotych" in normalize_text("249,99 zł")
    assert "dziewięćdziesiąt dziewięć groszy" in normalize_text("249,99 zł")


def test_time_date():
    assert "14:35" not in normalize_text("Godzina 14:35")
    assert normalize_text("04.10.2026") == "czwartego października dwa tysiące dwudziestego szóstego roku"
