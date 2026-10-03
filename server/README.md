# Audio i transkrypcja

## Lokalny zapis audio wysyłanego do modelu

W `server/.env` ustaw `STT_AUDIO_DEBUG_DIR=audio-debug` i uruchom ponownie backend.
Nagrania pojawią się w `server/audio-debug/`, niezależnie od katalogu uruchomienia.
Można też podać ścieżkę bezwzględną. Pusta lub nieustawiona zmienna wyłącza zapis.
Domyślnie zapis jest wyłączony; `server/audio-debug/` jest ignorowany przez Git.

Każdy nowy plik zawiera dokładnie bajty WAV po preprocessingu, kodowane do Base64
w żądaniu transkrypcji. Jest to PCM 16-bit, mono, 16 kHz; plik ma rozszerzenie `.wav`,
a nazwa zawiera czas UTC i unikalny identyfikator. Starsze `.webm` pozostają bez zmian.
Log backendu wskazuje zapisany plik. Nagranie bez wykrytej mowy nie jest wysyłane
i nie tworzy pliku debugowego. Długie nagranie może utworzyć kilka plików WAV.
Zapis następuje przed próbą wysłania, więc plik zostaje również po błędzie API
lub timeout. Nie dowodzi to, że dostawca odebrał żądanie. Błąd zapisu na dysk
jest logowany i nie blokuje transkrypcji. Pliki pozostają do ręcznego usunięcia.
Tryb `stub` nie wysyła audio do modelu i nie tworzy tych kopii.

## Droga audio we wtyczce

1. Skrót `Alt+Shift+A` uruchamia `handleToggle` w `extension/src/background/pipeline.ts`.
   Service worker tworzy dokument offscreen i wysyła `REC_START`.
2. `extension/src/offscreen/offscreen.ts` otwiera mikrofon przez `getUserMedia`
   (mono, redukcja szumu i echa). Domyślnie `MediaRecorder` zbiera WebM/Opus
   z bitrate 32 kb/s. Przy zbudowaniu wtyczki z `AUDIO_FORMAT=wav` Web Audio
   zbiera próbki, a `shared/wav.ts` konwertuje je do WAV PCM 16-bit, mono, 16 kHz.
3. Kolejne naciśnięcie skrótu albo limit 15 sekund kończy nagranie. Cały Blob
   jest wysyłany przez HTTP POST do `/api/transcribe` (domyślnie localhost:8787).
   Nagrania poniżej 1000 bajtów nie są wysyłane. To nie jest streaming.
4. `server/app/main.py` odczytuje bajty i Content-Type. W trybie rzeczywistym
   wywołuje `stt.transcribe` w puli wątków, dalej `stt_whisper.transcribe_whisper`.
5. `server/app/audio_processing.py` dekoduje audio, wykrywa mowę przez Silero VAD,
   wycisza tło i przycina ciszę. `server/app/stt_whisper.py` tworzy opcjonalną
   kopię każdego wynikowego WAV i wysyła JSON
   z `model` oraz `input_audio: {data: Base64, format: ...}` do
   `https://openrouter.ai/api/v1/audio/transcriptions` (lub OPENROUTER_BASE_URL).
   Dla modeli z „whisper” w nazwie dodaje `language=pl`, `temperature=0`,
   `response_format=verbose_json` oraz timestampy słów i segmentów. Timeout
   pojedynczego żądania wynosi do 10 sekund; budżet na preprocessing i wysyłki
   wynosi 22 sekundy (timeout wtyczki: 25 sekund).
6. `server/app/transcript_processing.py` filtruje wynik według dostępnych metadanych.
   Tekst wraca do offscreen, potem jako `TRANSCRIPT` do service workera.
   Ten maskuje tekst i wysyła go wraz z opisem strony do `/api/action`.
   Model `CHAT_MODEL` dostaje tekst i stan strony; audio dostaje model transkrypcji.

## Dlaczego STT_MODE?

STT oznacza speech-to-text, czyli zamianę mowy na tekst.

- `STT_MODE=stub` — tryb testowy bez wywołania modelu transkrypcji. Zwraca
  `STT_STUB_TEXT` (domyślnie „kliknij Znajdź”) lub wartość parametru `?text=`.
- `STT_MODE=whisper` — prawdziwe wywołanie API. Nazwa jest historyczna:
  konkretny model wybiera `STT_MODEL`, domyślnie `openai/whisper-large-v3-turbo`.
  Można wskazać inny model zgodny z tym endpointem, np. Parakeet.

Bez ustawienia `STT_MODE` backend używa `stub`. Moduł `live_stt/` jest osobnym
serwerem WebSocket z własnym wyborem backendu; ta ścieżka wtyczki go nie używa.

## Preprocessing i postprocessing z jj_whisper

Implementacja bazuje na `app/tools/vad.py` oraz `app/tools/transcribe_tools.py`
z dostarczonego `jj_whisper.zip`. Pozostaje backend OpenRouter; model transkrypcji
nie jest uruchamiany lokalnie. Lokalnie działa tylko Silero VAD na CPU.

Preprocessing:

- FFmpeg dekoduje WebM/Opus, WAV lub Ogg do mono 16 kHz. Wejście jest ograniczone
  do 60 sekund; wtyczka nadal nagrywa maksymalnie 15 sekund.
- Silero: próg `0.4`, minimalna mowa `200 ms`, minimalna cisza `200 ms`.
- Maska mowy dostaje margines `500 ms`. Poza nią sygnał zastępuje szum o odchyleniu
  `1e-5`; przejścia mają liniowy fade `10 ms`. Margines rozszerza zakresy bez
  zawijania końca nagrania na początek (poprawka względem `np.roll` w referencji).
- Wykrywanie ciszy ma próg `-50 dBFS` i długość `500 ms`; zachowujemy `500 ms`
  kontekstu. Podobnie jak w referencji, krótsze przerwy wewnątrz segmentu zostają.
  Segmenty mają maksymalnie 30 sekund, bez nakładających się fragmentów.
- Nagrania bez mowy nie generują wywołania modelu.

Postprocessing:

- Odrzuca segmenty z `avg_logprob <= -1` lub `compression_ratio >= 5`.
- Zachowuje listę języków z referencji: `en`, `de`, `pl`, `cs`, `sk`, `lt`, `uk`.
  Obsługuje też pełne nazwy języków z odpowiedzi Whispera, np. `polish`.
- Jeżeli dostępne są timestampy słów, odrzuca słowa bez pokrycia z zakresem mowy
  Silero. Tak jak referencja używa okna od `75 ms` przed końcem słowa do `250 ms`
  po jego końcu. Uwzględnia przesunięcie po przycięciu nagrania.
- Łączy pozostały tekst, zachowując interpunkcję. Nie zamienia liczebników na cyfry
  ani cyfr na słowa; sam model nadal może zwrócić liczby w dowolnej z tych postaci.

Ograniczenia wariantu OpenRouter:

- Żądamy `verbose_json` dla Whispera, ale dostępność ocen jakości, języka oraz
  timestampów zależy od odpowiedzi dostawcy. Każdy filtr działa tylko, gdy ma
  wymagane metadane. Przy samym `text` pozostaje usunięcie skrajnych białych znaków;
  brak segmentów/timestampów jest odnotowywany w logu bez treści wypowiedzi.
- Zakresy Silero zastępują zakresy mówców. Nie przenosimy lokalnej diarizacji NeMo,
  przypisywania identyfikatorów mówców ani bazy SQL ze słownikiem i promptem.
- Nie ma ponowienia z `condition_on_previous_text=False` ani lokalnego parametru
  `hallucination_silence_threshold`: obecny kontrakt OpenRouter nie daje nam tych
  ustawień lokalnego Whispera. Nie udajemy, że serwer je zastosował.

Wymagania: FFmpeg na PATH i `uv sync --locked` w `server/`. Lockfile wybiera
PyTorch CPU dla Windows/Linux. Silero ładuje wagi dostarczane w paczce, bez
pobierania repozytorium przez `torch.hub`. Backend przygotowuje VAD podczas startu.

Kontrakt API: https://openrouter.ai/blog/tutorials/transcription-on-openrouter/
