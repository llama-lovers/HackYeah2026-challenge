# live_tts

## What it does

Lokalny TTS po polsku: Piper ładowany raz na proces, WAV lub HTTP streaming.
Bez UI, GPU, ffmpeg i wywoływania CLI dla każdego tekstu. Port domyślny: **7001**.

## Architecture

`text → optional normalizer → backend factory → Piper → PCM chunks → HTTP`

FastAPI, `Settings`, fabryka backendów i lifecycle start/close odpowiadają filozofii
`live_stt`. STT odczytano z `jj`, ponieważ nie ma go na branchu `ms_tts`.
Nie zmieniano STT. Tutaj jeden proces Python wystarcza; nie potrzebujemy procesu NeMo.
Model działa w wątku poza event loop. Jedna aktywna synteza; kolejne żądania dostają
HTTP 429 zamiast nieograniczonej kolejki. `/health` pozostaje dostępny.
Po rozłączeniu klienta kończy się bieżąca inferencja zdania, następne są anulowane.

## Selected model

**pl_PL-mc_speech-medium**, CPU, natywnie **22050 Hz**, mono.
Piper 1.8.0, oficjalny `PiperVoice.load` i iterator `PiperVoice.synthesize`.
Model i plik `.onnx.json` są ignorowane przez Git.

## Selected preset

**high_variation**, wybrany przez użytkownika po benchmarku Piper:

```text
length_scale=1.0
noise_scale=0.85
noise_w_scale=1.0
volume=1.0
```

`SynthesisConfig` używa tych wartości; `normalize_audio=True` pozostaje domyślne
w Piper. To normalizacja głośności, niezależna od normalizacji tekstu.

## Setup

W katalogu `HackYeah2026-challenge/live_tts`:

```sh
uv sync --locked
cp config.env.example config.env
```

Python **3.12** wybrano jako wersję sprawdzoną z Piper w istniejącym benchmarku
oraz w tym serwisie. Nie zmienia to Pythona STT ani systemowego. Piper deklaruje
Python >=3.9; nie twierdzimy, że sam Piper wyklucza 3.14. Nie wprowadzamy
nieprzetestowanego runtime 3.14 tylko dla zgodności numeru ze STT.
`pyproject.toml` i `uv.lock` są źródłem zależności. `requirements-*.txt` to eksporty
tego samego locka, dla instalacji pip (nie osobna lista wersji).

## Download voice

```sh
uv run --locked scripts/download_model.py
```

Skrypt wywołuje oficjalne `python -m piper.download_voices --download-dir models
pl_PL-mc_speech-medium` z ustawieniami config. Istniejących plików nie pobiera ponownie.
W bieżącym checkoutcie wykorzystano lokalne wagi z benchmarku, bez nowego downloadu.

## Run

```sh
uv run --locked run.py
```

Po aktywowaniu `.venv` działa też `python run.py`. Zatrzymanie: Ctrl+C.
Używaj jednego workera; każdy dodatkowy proces ładowałby osobną kopię modelu.
`config.env` jest opcjonalny, procesowe zmienne `TTS_*` mają pierwszeństwo.
Przykład: `TTS_HOST=127.0.0.1 TTS_PORT=7002 uv run --locked run.py`.
API nie ma autoryzacji; domyślne `0.0.0.0` udostępnia je w lokalnej sieci.

## API

```sh
curl -fsS http://127.0.0.1:7001/health
curl -fsS http://127.0.0.1:7001/synthesize \
  -H 'Content-Type: application/json' \
  -d '{"text":"Dzień dobry, w czym mogę dzisiaj pomóc?"}' -o hello.wav
curl -fsS http://127.0.0.1:7001/synthesize \
  -H 'Content-Type: application/json' \
  -d '{"text":"Do zapłaty są dwieście czterdzieści dziewięć złotych i dziewięćdziesiąt dziewięć groszy."}' -o payment.wav
curl -fsS -N http://127.0.0.1:7001/synthesize/stream \
  -H 'Content-Type: application/json' \
  -d '{"text":"Dzień dobry. W czym mogę pomóc?"}' -o speech.pcm
```

Alias health: `/ready`; aliasy POST: `/v1/synthesize`, `/v1/synthesize/stream`.
Lokalne `/synthesize` zwraca kompletny `audio/wav`. Streaming zwraca `audio/pcm`,
**signed PCM16 little-endian, mono, bez nagłówka WAV**. Nagłówki `X-Sample-Rate`,
`X-Channels`, `X-Audio-Encoding` opisują format. Transport HTTP może dzielić
fragmenty dowolnie — klient musi zachować resztę niepełnej próbki dwubajtowej.
Frontend powinien podawać PCM do AudioWorklet; zwykły `<audio src>` nie obsłuży
POST z surowym PCM. Do bezpośredniego odtwarzania strumienia w terminalu można
zastąpić `-o speech.pcm` przez `| ffplay -nodisp -autoexit -f s16le -ar 22050 -ac 1 -`.
ffplay jest tylko opcjonalnym klientem, nie zależnością serwera.

**Piper streamuje po zdaniu, nie po fonemie.** Pierwsze zdanie można odtwarzać,
gdy kolejne się generuje. Dla pojedynczego zdania trzeba poczekać na jego całą
inferencję. Brak sztucznego dzielenia gotowego WAV-a udającego streaming.

Logi: `model_load_time`, `load_count`, `received_at` (Unix timestamp),
`first_audio_chunk_latency`, `total_generation_time`, `request_elapsed`,
`text_length`, liczba chunków i `complete`. Nie logujemy tekstu ani kluczy.
Czas generowania to suma oczekiwania na iterator (bez transferu do klienta);
`request_elapsed` obejmuje także transfer/backpressure. Pierwszy fragment jest
pobierany przed nagłówkami, żeby wczesny błąd dał HTTP 502. Błąd po rozpoczęciu
strumienia zrywa połączenie — klient powinien odrzucić niepełny wynik.

## Text normalization

`TTS_NORMALIZE_TEXT=false` domyślnie, żeby zachować rezultat wybranego benchmarku.
Po włączeniu: kwoty PLN, procenty, godziny HH:MM, poprawne daty DD.MM.YYYY
z lat 2001–2099 i samodzielna liczba całkowita. Pozostałe teksty zachowujemy.
Daty używają formy dopełniacza; godziny prostego odczytu liczbowego.
To ograniczony MVP, bez rozpoznawania kontekstu gramatycznego. Nie zmienia
`2 wiadomości`, `00123`, telefonu, kodu pocztowego, wersji, emaila ani URL.
Dla krytycznych komunikatów podawaj wcześniej przygotowany tekst słowny.

## Backend switching

`TTS_BACKEND=local` — w pełni lokalny Piper, żaden klucz nie jest potrzebny.
`BACKEND` działa jako alias tylko wtedy, gdy nie ustawiono `TTS_BACKEND`.

`TTS_BACKEND=openrouter` — zaimplementowany opcjonalny adapter oficjalnego
`POST https://openrouter.ai/api/v1/audio/speech`. Wymaga jawnego ustawienia
`TTS_OPENROUTER_API_KEY`, `TTS_OPENROUTER_MODEL`, `TTS_OPENROUTER_VOICE`.
Wybierz model z modalnością `speech` oraz głos wspierany przez ten model.
Nie wykorzystujemy endpointu transkrypcji z STT do generowania mowy.
Oba endpointy zwracają w tym backendzie **MP3 (`audio/mpeg`)**; sample rate
jest zapisany w MP3, nie zgadujemy formatu PCM dostawcy. Lokalne parametry Piper
nie są przekazywane do OpenRouter. Nie ma automatycznego fallbacku ani retry.
`/health` potwierdza konfigurację, nie saldo/dostęp do zdalnego modelu.
**Nie wykonano płatnego wywołania OpenRouter** — testowany jest kontrakt HTTP,
a rzeczywista synteza i pomiary dotyczą tylko lokalnego Pipera.

`TTS_BACKEND=remote` pozostaje jawnym, niezaimplementowanym miejscem rozszerzenia;
start kończy się czytelnym błędem. Nowego dostawcę dodaj do `backends.py`.
Po zmianie backendu uruchom proces ponownie. Sekrety trzymaj w ignorowanym `config.env`.

## Tests

```sh
uv run --locked pytest -q
# Przy działającym serwerze:
uv run --locked scripts/smoke_test.py
```

Testy lokalnego silnika/API używają prawdziwego modelu (skip, jeśli nie pobrano wag).
Test zdalnego kontraktu używa MockTransport, bez płatnego ruchu i bez udawania WAV.
Smoke zapisuje prawdziwe nagrania i pomiary w ignorowanym `artifacts/`.
Aby porównać odbiór pierwszych bajtów z końcem inferencji w logach:

```sh
mkdir -p artifacts
uv run --locked run.py > artifacts/server.log 2>&1
# W drugim terminalu:
uv run --locked scripts/smoke_test.py --server-log artifacts/server.log
```

## Sources and licenses

- [Piper Python API](https://github.com/OHF-Voice/piper1-gpl/blob/main/docs/API_PYTHON.md)
- [Piper code, GPL-3.0](https://github.com/OHF-Voice/piper1-gpl)
- [MC Speech model card](https://huggingface.co/rhasspy/piper-voices/blob/main/pl/pl_PL/mc_speech/medium/MODEL_CARD):
  22050 Hz, dataset CC0, fine-tuned from Lessac; karta nie wyodrębnia osobnej licencji wag.
- [Oficjalne OpenRouter TTS](https://openrouter.ai/docs/guides/overview/multimodal/tts)
- API sprawdzono również w lokalnym Piper 1.8.0 oraz `test_tts/piper_sweep.py`.

## Docker (optional)

Po lokalnym setupie i pobraniu głosu:

```sh
uv run --locked run.py --docker
uv run --locked run.py --docker logs
uv run --locked run.py --docker stop
```

Compose >=2.24 wymagany dla opcjonalnego `config.env`. Model jest montowany z
`./models` tylko do odczytu, nie trafia do obrazu. Ten sam port i API co lokalnie.
Nie potrzeba GPU. `config.env`, cache i artefakty są wykluczone z kontekstu budowy.

## Local validation (2026-10-03)

Apple M2, macOS, Python 3.12: **34 tests passed**, bez pominiętych testów.
Rzeczywisty serwer: health OK, model_load_count=1, model_load_time=0,515 s.
Wypowiedź 1031 znaków / 16 zdań: pierwszy PCM u klienta **69,3 ms**
(serwer 67,5 ms), pełna generacja **1,550 s**. Pierwszy fragment dotarł
przed zakończeniem inferencji. Test zerwania połączenia i kolejnej syntezy przeszedł.
To pojedynczy pomiar na rozgrzanym modelu, nie gwarantowane p95.
WAV-y i JSON: `artifacts/smoke_1.wav`, `smoke_2.wav`, `smoke_stream.wav`,
`smoke_results.json`; log: `artifacts/server_final.log`.
`uv lock --check`, `uv pip check` i `docker compose config` przeszły.
Obrazu Docker nie budowano. OpenRouter sprawdzono tylko przez test kontraktu HTTP.
