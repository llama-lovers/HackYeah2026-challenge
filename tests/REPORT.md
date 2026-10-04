# Raport testów głosowych InPost

Wygenerowano: niedziela, 4 października 2026 01:17:01 CEST.
Kod: main, commit e906c7d168b24e6fefcfb1af52c8ae4719dade01.

**6/7 scenariuszy zaliczonych. 8 wykonań, w tym powtórzenia.**

Prawdziwa strona https://inpost.pl/, Chrome for Testing 154.0.8037.92, izolowane profile, polski głos Microsoft Paulina Desktop. Syntetyczny WAV podany jako mikrofon; wtyczka nagrywa WebM/Opus, backend wykonuje Silero/preprocessing, a OpenRouter rzeczywiste STT i wybór akcji. Wyzwolenie nagrywania przez testowy hook zamiast fizycznego skrótu klawiaturowego. Żadne odpowiedzi STT ani modeli nie były podstawiane.

Konfiguracja podczas tych testów: STT_MODE=whisper, STT_MODEL=openai/whisper-large-v3, CHAT_MODEL=anthropic/claude-sonnet-5.5. Testy działały na istniejącym backendzie localhost:8787.

| Scenariusz | Wynik | Próby | Oczekiwany efekt |
|---|---|---:|---|
| silence | PASS | 1 | Brak zmian formularza i komunikat o braku mowy. |
| missing-button | PASS | 1 | Brak kliknięcia i nawigacji; komunikat o braku elementu. |
| invalid-parcel | PASS | 1 | Odrzucenie numeru długości 3; formularz bez zmian. |
| fill-parcel | FAIL | 2 | Pole numeru przesyłki zawiera 78901234; brak wysłania formularza. |
| search-navigation | PASS | 1 | Przejście do wyszukiwarki lub otwarcie widocznego pola wyszukiwania. |
| pricing-navigation | PASS | 1 | Przejście na stronę cennika InPost. |
| fill-parcel-24 | PASS | 1 | Pole zawiera dokładnie 123456789012345678901234 (24 cyfry); formularz nie jest wysyłany. |

## Wykryte problemy

1. **Powtarzalne błędne wypełnienie numeru.** W obu próbach nagrania „Wpisz siedem osiem dziewięć zero jeden dwa trzy cztery w pole numeru przesyłki” endpoint STT zwrócił „Wpisz 789 -01234 w pole numeru przesyłki.” Model akcji otrzymał już tekst z separatorem i wpisał `789 -01234`. Asercja wymagała `78901234`. To błąd treści w polu, mimo odpowiedzi HTTP 200. Sam raport nie rozstrzyga, czy separator powstał w surowym Whisperze, czy podczas postprocessingu timestampów.

2. **Niezgodny komunikat o długości numeru.** Agent mówi, że numer ma osiem albo dwadzieścia cztery cyfry. Rzeczywisty formularz strony głównej pokazuje „Podaj jeden numer przesyłki zawierający 24 cyfry”. Test wypełnienia ośmioma cyframi sprawdzał wyłącznie wierne przepisanie, a nie akceptację numeru przez serwis. Osobny test 24 cyfr przeszedł: w polu znalazło się dokładnie `123456789012345678901234`.

Do dalszej diagnozy: porównać surowe `text`/`words` dostawcy z końcową transkrypcją; dla pola przesyłki walidować cyfry i separatory deterministycznie oraz dopasować komunikat o długości do aktualnego formularza. Wykryte problemy pozostają do naprawienia.

## Dowody

### silence

Audio: [silence.wav](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/audio/silence.wav)

Próba 1: **PASS**, 11.5 s (łącznie z uruchomieniem przeglądarki, ładowaniem strony i odtwarzaniem audio).

- Transkrypcja: (pusta)
- URL po: https://inpost.pl/
- Wartość pola po: ""
- [Wynik JSON](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-06-56-046Z/silence/result.json) · [Przed](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-06-56-046Z/silence/before.png) · [Po](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-06-56-046Z/silence/after.png)

### missing-button

Audio: [missing-button.wav](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/audio/missing-button.wav)

Próba 1: **PASS**, 14.1 s (łącznie z uruchomieniem przeglądarki, ładowaniem strony i odtwarzaniem audio).

- Transkrypcja: "Kliknij przycisk fioletowy jednorożec."
- URL po: https://inpost.pl/
- Wartość pola po: ""
- [Wynik JSON](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/missing-button/result.json) · [Przed](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/missing-button/before.png) · [Po](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/missing-button/after.png)

### invalid-parcel

Audio: [invalid-parcel.wav](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/audio/invalid-parcel.wav)

Próba 1: **PASS**, 10.5 s (łącznie z uruchomieniem przeglądarki, ładowaniem strony i odtwarzaniem audio).

- Transkrypcja: "Śledź paczkę numer 123."
- URL po: https://inpost.pl/
- Wartość pola po: ""
- [Wynik JSON](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/invalid-parcel/result.json) · [Przed](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/invalid-parcel/before.png) · [Po](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/invalid-parcel/after.png)

### fill-parcel

Audio: [fill-parcel.wav](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/audio/fill-parcel.wav)

Próba 1: **FAIL**, 22.1 s (łącznie z uruchomieniem przeglądarki, ładowaniem strony i odtwarzaniem audio).

- Transkrypcja: "Wpisz 789 -01234 w pole numeru przesyłki."
- URL po: https://inpost.pl/
- Wartość pola po: "789 -01234"
- [Wynik JSON](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/fill-parcel/result.json) · [Przed](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/fill-parcel/before.png) · [Po](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/fill-parcel/after.png)

Próba 2: **FAIL**, 21.0 s (łącznie z uruchomieniem przeglądarki, ładowaniem strony i odtwarzaniem audio).

- Transkrypcja: "Wpisz 789 -01234 w pole numeru przesyłki."
- URL po: https://inpost.pl/
- Wartość pola po: "789 -01234"
- [Wynik JSON](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-09-55-007Z/fill-parcel/result.json) · [Przed](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-09-55-007Z/fill-parcel/before.png) · [Po](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-09-55-007Z/fill-parcel/after.png)

### search-navigation

Audio: [search-navigation.wav](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/audio/search-navigation.wav)

Próba 1: **PASS**, 17.1 s (łącznie z uruchomieniem przeglądarki, ładowaniem strony i odtwarzaniem audio).

- Transkrypcja: "Kliknij Szukaj."
- URL po: https://inpost.pl/szukaj
- Wartość pola po: null
- [Wynik JSON](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/search-navigation/result.json) · [Przed](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/search-navigation/before.png) · [Po](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/search-navigation/after.png)

### pricing-navigation

Audio: [pricing-navigation.wav](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/audio/pricing-navigation.wav)

Próba 1: **PASS**, 22.4 s (łącznie z uruchomieniem przeglądarki, ładowaniem strony i odtwarzaniem audio).

- Transkrypcja: "Kliknij cennik."
- URL po: https://inpost.pl/cenniki
- Wartość pola po: null
- [Wynik JSON](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/pricing-navigation/result.json) · [Przed](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/pricing-navigation/before.png) · [Po](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-07-39-848Z/pricing-navigation/after.png)

### fill-parcel-24

Audio: [fill-parcel-24.wav](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/audio/fill-parcel-24.wav)

Próba 1: **PASS**, 25.2 s (łącznie z uruchomieniem przeglądarki, ładowaniem strony i odtwarzaniem audio).

- Transkrypcja: "Wpisz 123456789012345678901234 w pole numeru przesyłki."
- URL po: https://inpost.pl/
- Wartość pola po: "123456789012345678901234"
- [Wynik JSON](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-11-07-915Z/fill-parcel-24/result.json) · [Przed](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-11-07-915Z/fill-parcel-24/before.png) · [Po](C:/Users/zbugo/Desktop/HackYeah2026-challenge/test-artifacts/inpost/run-2026-10-03T23-11-07-915Z/fill-parcel-24/after.png)

## Ograniczenia

- Strona pokazywała przerwę serwisową 4.10.2026, 00:00–08:00. Przejścia do wyszukiwarki i cennika były mimo to dostępne.
- Nie wysyłano formularza z numerem, nie sprawdzano rzeczywistej przesyłki, nie wykonywano zakupów ani logowania.
- Wyniki dotyczą jednego syntetycznego głosu i desktopowego viewportu. Nie weryfikują realnego mikrofonu, hałasu, akcentów, skrótu systemowego ani czytnika ekranu.
- Poza nieudanym scenariuszem wykonanym dwukrotnie testy miały po jednej próbie; nie jest to miara statystycznej skuteczności modeli.

## Odtworzenie

Plan i instrukcja: [PLAN.md](C:/Users/zbugo/Desktop/HackYeah2026-challenge/extension/e2e/inpost-live/PLAN.md).
Po uruchomieniu testów wygeneruj raport poleceniem `node extension/e2e/inpost-live/report.mjs` z katalogu repo.
