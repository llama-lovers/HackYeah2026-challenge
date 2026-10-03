# Brief: moduł rozpoznawania mowy (STT) — zadania dla programisty

**Dla:** osoba robiąca integrację Whisper / STT
**Stan na:** 2026-10-03
**Powiązane:** `01-CONTEXT.md` (D-11, D-12, D-13, D-15), `01-RESEARCH.md`, `CLAUDE.md` §3 (prywatność)

## 1. Po co to jest

Użytkownik niewidomy naciska skrót (Alt+Shift+A), mówi polecenie po polsku („wpisz 620… w pole numeru przesyłki”, „kliknij Znajdź”), naciska skrót drugi raz. Wtyczka nagrywa dźwięk w dokumencie offscreen i wysyła go do **naszego proxy w Pythonie (FastAPI)**. Proxy zwraca polski tekst. Reszta potoku (model, kliknięcie, komunikat o skutku) to już nasza część.

Liczy się czas od drugiego naciśnięcia skrótu do usłyszenia „Klikam …”, więc STT ma być szybkie i przewidywalne.

## 2. Ważne fakty techniczne (sprawdzone 2026-10-03)

- **OpenRouter `POST /api/v1/audio/transcriptions` nie ma streamingu.** Działa tylko jako żądanie z całym plikiem i odpowiedź z całym tekstem. W dokumentacji nie ma `stream=true`, SSE ani WebSocketu.
- **Sam Whisper (`whisper-1`, `whisper-large-v3(-turbo)`) nie zwraca tekstu przyrostowo.** Streaming wyniku mają nowsze modele OpenAI (rodzina `gpt-4o-transcribe`, a w Realtime API także nowsze modele transkrypcji). Działają tylko **bezpośrednio przez API OpenAI**, a nie przez OpenRouter.
- Są dwa rodzaje „streamingu” i dają różny zysk:
  - **Plik + `stream=true`** (`/v1/audio/transcriptions` OpenAI): tekst płynie szybciej, ale **upload startuje dopiero po skończeniu mówienia**. Przy poleceniach 2–5 s zysk jest mały (rzędu kilkuset ms).
  - **Realtime WebSocket**: dźwięk jest wysyłany **w trakcie mówienia**, a model transkrybuje na bieżąco. Po puszczeniu skrótu zostaje tylko dokończenie ostatnich fragmentów. **To jest wariant, który realnie przyspiesza.**
- Realtime wymaga formatu **PCM16 mono, 24 kHz** (base64 w zdarzeniach `input_audio_buffer.append`). MediaRecorder z webm/opus się do tego nie nadaje, więc po stronie wtyczki potrzebny jest AudioWorklet.
- Realistycznie: STT na krótkim poleceniu zajmuje ok. 0,5–1,5 s, a wywołanie modelu Claude wybierającego akcję 2–5 s. Streaming STT oszczędzi część tej pierwszej liczby, ale nie zastąpi optymalizacji wywołania modelu.

**Wniosek:** na razie robimy tylko prosty, zamrożony kontrakt (sekcja 3), na którym działa całe demo. Streaming jest odłożony (sekcja 4).

## 3. Kontrakt (zrobić najpierw)

To jest uzgodniony szew (decyzja D-11). Reszta zespołu już planuje pod niego pracę, więc **nie zmieniamy sygnatur bez rozmowy**.

### 3.1 Funkcja w proxy

- Plik: `server/stt.py` (lub inny w `server/`, do ustalenia, byle importowalny z aplikacji FastAPI).
- Sygnatura: `transcribe(audio_bytes: bytes, mime: str) -> str`
  - funkcja **synchroniczna** (route woła ją przez `run_in_threadpool`). Jeśli wolisz async, napisz od razu, wtedy zmienimy wywołanie;
  - zwraca **sam tekst** po polsku, bez normalizacji (nie zamieniaj „sześćset dwadzieścia” na cyfry, to zrobimy w fazie 2);
  - cisza lub brak mowy daje **pusty string `""`**, nie wyjątek. Wtyczka sama powie „Nic nie usłyszałem”;
  - błąd dostawcy (HTTP ≠ 200, timeout, zły format) to wyjątek `TranscriptionError(code: str)`, gdzie `code` ∈ `provider_error`, `timeout`, `unsupported_format`.
- Wywołanie OpenRouter: `POST https://openrouter.ai/api/v1/audio/transcriptions`, model `openai/whisper-large-v3-turbo` (zapasowo `openai/whisper-1`), **zawsze `language: "pl"`**, klucz z `OPENROUTER_API_KEY` w env.
- Timeout żądania do dostawcy: **10 s**.

### 3.2 Route (spina go nasza strona, ale musisz wiedzieć, jak wygląda)

- `POST /api/transcribe`, body to **surowe bajty audio** (nie multipart), nagłówek `Content-Type: audio/webm;codecs=opus` (zapasowo `audio/wav`).
- Odpowiedź `200 {"text": "..."}`. Błędy: `502 {"error": "<code>"}`, a dla timeoutu `504 {"error": "timeout"}`.
- Limit rozmiaru body: 2 MB (15 s nagrania z dużym zapasem).

### 3.3 Tryb stub (D-13)

- `STT_MODE=stub` zwraca stały tekst z `STT_STUB_TEXT` (dev może go nadpisać parametrem `?text=`).
- `STT_MODE=whisper` używa prawdziwego wywołania.
- Dzięki temu cały potok działa, zanim Twój moduł będzie gotowy. **Nie blokujesz nikogo.**

### 3.4 Pierwsza godzina: smoke test formatu (D-12)

1. Nagraj 3 próbki w Chrome przez MediaRecorder (`audio/webm;codecs=opus`, mono, ok. 32 kbps): „kliknij Znajdź”, „wpisz sześćset dwadzieścia jeden trzysta w pole numeru przesyłki”, cisza 2 s.
2. Puść je przez OpenRouter Whisper z `language=pl`.
3. Jeśli webm zostanie odrzucony albo tekst jest śmieciowy, przechodzimy na **WAV PCM16 mono 16 kHz** (nagłówek pisany ręcznie, bez biblioteki). Daj znać od razu, bo to zmienia kod nagrywania we wtyczce.
4. Zapisz zmierzone czasy (sam czas, bez treści) do `server/tests/fixtures/README.md`.

## 4. Streaming — odłożony

Streaming (OpenAI Realtime przez WebSocket) jest **świadomie odłożony** (decyzja zespołu 2026-10-03). OpenRouter nie ma streamingu STT, a Whisper nie zwraca tekstu przyrostowo. Wrócimy do tego po działającym demo, jeśli pomiary pokażą, że STT jest wąskim gardłem. Nie implementuj go teraz.

## 5. Prywatność i bezpieczeństwo (nienegocjowalne)

- **Nie loguj audio ani tekstu transkrypcji**, nawet na debug. Logujemy tylko metodę, route, status i czas trwania.
- Uwaga na pułapki: domyślny 422 w FastAPI i błędy pydantic wklejają dane wejściowe do odpowiedzi i logów, a uvicorn loguje query string (`?text=` w stubie!).
- Klucze tylko w `server/.env` (gitignorowany). Do `server/.env.example` dopisz `STT_MODE=` i `STT_STUB_TEXT=` **bez wartości**.
- Nie zapisuj nagrań na dysk poza świadomie nagranymi fixture'ami testowymi z własnym głosem.

## 6. Testy i definicja „gotowe”

Moduł jest gotowy, gdy:
- [ ] `transcribe()` zwraca poprawny polski tekst dla 3 próbek z §3.4 (sprawdzone ręcznie, czasy zapisane);
- [ ] pytest: stub zwraca `STT_STUB_TEXT`; błąd dostawcy (mock `httpx.MockTransport`) daje `TranscriptionError("provider_error")`; cisza daje `""`; `language=pl` jest zawsze w żądaniu;
- [ ] grep po logach z testu nie znajduje tekstu transkrypcji.

## 7. Kolejność prac

1. Smoke test webm z §3.4 (pierwsza godzina, wynik od razu na czat zespołu).
2. `transcribe()` + stub + testy. **Na tym działa demo.**
3. Wspólny pomiar czasów end-to-end na stronie InPost.

## 8. Czego nie robić

- Nie wysyłaj dźwięku z content scriptu ani strony InPost. Nagrywanie jest tylko w offscreen.
- Nie używaj Web Speech API (`SpeechRecognition`): audio idzie wtedy do Google, a decyzja zespołu to Whisper.
- Nie dodawaj zależności Pythona bez powodu. Wystarczą `httpx` i `fastapi`.
- Nie normalizuj tekstu (liczby, numer paczki). To faza 2.
