# Parakeet ASR — lokalnie albo przez OpenRouter

Jeden serwer WebSocket, ten sam klient GUI i przełącznik w `config.env`.

## Uruchomienie na Windows

Wymagane: Docker Desktop z kontenerami Linux i Python 3.10+ do skryptu
uruchamiającego. Skrypt nie potrzebuje żadnych bibliotek pip.

1. Rozpakuj folder. Jeśli zastępujesz poprzednią wersję, zachowaj swój klucz
   i wpisz go do nowego `config.env`. Nie używaj równolegle starego serwera
   na tym samym porcie 7000.
2. W `config.env` wybierz tryb (przykłady poniżej).
3. Uruchom `start.bat` albo w folderze projektu:

```bat
python run.py start
```

4. Logi:

```bat
python run.py logs
```

5. W poprzednim kliencie GUI Parakeet ustaw:

```text
ws://127.0.0.1:7000/v1/transcribe
```

Pole klucza w GUI zostaw puste. Klucz OpenRouter jest wyłącznie na serwerze.
Z innego komputera użyj adresu IP serwera, np.
`ws://192.168.7.159:7000/v1/transcribe`.

## OpenRouter

```env
ASR_BACKEND=openrouter
OPENROUTER_API_KEY=sk-or-v1-TWOJ_KLUCZ
OPENROUTER_MODEL=nvidia/parakeet-tdt-0.6b-v3
```

Ten tryb buduje lekki obraz bez NeMo, PyTorch i CUDA. Nie wymaga GPU.
Klucz i dostępność modelu są sprawdzane przy pierwszej rzeczywistej
transkrypcji. Konto OpenRouter musi mieć środki i dostęp do wybranego modelu.
`/health` i `/ready` potwierdzają inicjalizację aplikacji, nie saldo ani ważność klucza.

## Lokalny model

```env
ASR_BACKEND=local
MODEL_NAME=nvidia/parakeet-tdt-0.6b-v3
DEVICE=cuda
ENABLE_PARTIALS=true
```

Klucz OpenRouter nie jest wtedy potrzebny ani używany. Model jest ładowany
przez NeMo w kontenerze na komputerze/serwerze, na którym działa Docker.
Pierwsze uruchomienie pobiera biblioteki oraz model i może potrwać znacznie
 dłużej. Wagi są przechowywane w wolumenie `parakeet-cache`.

Tryb CUDA wymaga GPU NVIDIA, zgodnego sterownika i udostępnienia GPU Dockerowi
(na Linuksie NVIDIA Container Toolkit; na Windows odpowiednia konfiguracja
Docker Desktop/WSL2). Skrypt automatycznie dodaje `compose.gpu.yaml`.
Możesz ustawić `DEVICE=cpu`: wtedy nie rezerwuje GPU, lecz transkrypcja może
być wolniejsza. Lokalny obraz pozostaje duży, bo zawiera PyTorch i NeMo.

Pozostawiono precyzję ładowania oryginalnego silnika; ta zmiana nie jest
optymalizacją VRAM ani gwarancją działania na karcie 4 GB.

## Przełączanie

Zmień `ASR_BACKEND` w `config.env`, zapisz i ponownie uruchom:

```bat
python run.py start
```

Skrypt wybiera etap budowania obrazu oraz rezerwację GPU, a następnie odtwarza
kontener z nową konfiguracją. Przełączenie rozłącza aktywne sesje: najpierw
zatrzymaj nagrywanie w GUI, a po gotowości serwera połącz klienta ponownie.
Adres WebSocket nie zmienia się. Nie ma automatycznego przełączania na chmurę
w razie błędu lokalnego modelu.

Nie uruchamiaj zwykłego `docker compose up` bez wyboru konfiguracji: sam plik
`env_file` nie steruje interpolacją etapu budowania ani rezerwacją GPU.
`run.py` robi to za Ciebie. Parametry wpisuj jako `NAZWA=wartość`; komentarze
umieszczaj w osobnych wierszach. Można otoczyć wartość parą cudzysłowów.

Równoważne polecenia ręczne:

OpenRouter (z `ASR_BACKEND=openrouter`):

```bat
docker compose --env-file config.env -f compose.yaml up -d --build --force-recreate
```

Lokalny CUDA (z `ASR_BACKEND=local` i `DEVICE=cuda`):

```bat
docker compose --env-file config.env -f compose.yaml -f compose.gpu.yaml up -d --build --force-recreate
```

Na Linuxie: `python3 run.py start` lub `sh start.sh`.
Zatrzymanie: `python run.py stop`. Nie usuwa pobranych modeli.

## Zachowanie transkrypcji

| Właściwość | local | openrouter |
|---|---|---|
| Połączenie klienta | WebSocket | Ten sam WebSocket |
| Wykonanie transkrypcji | NeMo na serwerze Docker | HTTP do OpenRouter |
| Wyniki częściowe | Tak, gdy ENABLE_PARTIALS=true | Tak, gdy ENABLE_PARTIALS=true |
| Wyniki zatwierdzone | final | final |
| Klucz OpenRouter | Nieużywany | Wymagany |
| GPU | Dla DEVICE=cuda | Niewymagane |

Oba tryby używają wspólnego VAD. Segment jest zatwierdzany po
`END_SILENCE_MS=600` ms ciszy, osiągnięciu `MAX_SEGMENT_MS=5000` ms bufora,
komunikacie `flush` albo zakończeniu `end` (przycisk Stop).
W przeciwieństwie do wcześniejszego prostego serwera OpenRouter, długie
odcinki samej ciszy nie są wysyłane do usługi. VAD może jednak uznać hałas
za mowę. Krótkie pauzy i bufor przed początkiem mowy są częścią segmentu.

W OBU trybach `ENABLE_PARTIALS=true` włącza ponowne przepisywanie rosnącego
segmentu. Pierwsza hipoteza jest zlecana po `MIN_PARTIAL_MS=1000` ms audio,
kolejne co `PARTIAL_INTERVAL_MS=800` ms. To progi audio, nie gwarancja czasu
otrzymania odpowiedzi. Kolejny `partial` z tym samym `segment_id` i wyższym
`revision` zastępuje wcześniejszy tekst. `final` zastępuje ostatni partial
i zamyka segment: późniejsze wypowiedzi już go nie poprawiają.
Dotychczasowy klient GUI obsługuje to bez zmian (niebieski partial, czarny final).

W OpenRouter każda hipoteza jest osobnym żądaniem HTTP, które zawiera CAŁE
zebrane audio bieżącego segmentu. Nie przekazujemy poprzedniego tekstu do
korekty i nie używamy natywnego streamingu usługi. Oznacza to powtarzające
się przetwarzanie i rozliczanie tego samego audio. Więcej kontekstu pozwala
zmienić rozpoznanie, ale nie gwarantuje poprawienia każdego błędu.

Jeżeli HTTP nie nadąża, odbieranie mikrofonu nadal działa. Oczekujące starsze
partial danego segmentu są zastępowane najnowszym; wszystkie final pozostają
w kolejności. Już wysłane żądanie jest kończone, po czym przetwarzana jest
najnowsza oczekująca wersja. Nie ma równoległych żądań dla tego samego klienta.

`ENABLE_PARTIALS=false` wyłącza częściowe wyniki dla wybranego backendu.
Większy `PARTIAL_INTERVAL_MS` (np. 1600) zmniejsza częstotliwość żądań.
Każdy segment jest niezależny; granica limitu długości może przeciąć słowo.
Czas do wyniku obejmuje zebranie fragmentu i obliczenia oraz transmisję
w trybie OpenRouter.

To wspólna integracja dla tych dwóch silników, nie dowolnego endpointu/modelu.
`MODEL_NAME` wybiera zgodny model NeMo Parakeet, a `OPENROUTER_MODEL` — zgodny
model STT endpointu `/api/v1/audio/transcriptions`. Nie każdy model tekstowy
OpenRouter obsługuje takie żądania. `WORD_TIMESTAMPS=true` obsługiwane jest
wyłącznie lokalnie; w OpenRouter wymagane jest false.

## Protokół i ograniczenia

- Ścieżki: `/v1/transcribe` i `/ws`.
- Wejście: binarne PCM16 LE, 16 kHz, mono, zwykle porcje 20 ms. Wysyłaj też ciszę.
- Sterowanie: `{"type":"flush"}` kończy segment; `{"type":"end"}` kończy wejście audio.
- Wyjście: `ready`, opcjonalnie `partial`, `final`, a po opróżnieniu kolejki `done`.
- `segment_id` identyfikuje fragment, `revision` jego wersję. `start_ms` i `end_ms`
  dotyczą osi czasu audio otrzymanego przez połączenie.
- Wspólny limit `MAX_CONNECTIONS` i kolejka `MAX_PENDING_SEGMENTS`.
- Brak automatycznych ponowień żądań płatnych; błędy nie przełączają backendu.
- Zerwanie połączenia lub przepełnienie kolejki oznacza przerwanie sesji.
- Port jest wystawiony w sieci jako `7000:7000`, zgodnie z wcześniejszą konfiguracją.
  API nie uwierzytelnia klientów. Dla dostępu wyłącznie z tego komputera ustaw
  `127.0.0.1:7000:7000` w compose.yaml.
- `config.env` jest wykluczony z kontekstu budowania i z Git. Nie publikuj klucza.

## Sprawdzenie

```bat
curl http://127.0.0.1:7000/health
```

Wynik pokazuje aktywne `backend`, `model` i `device`.

Przeszło 30 testów: wspólny protokół WS, odbieranie podczas inferencji,
VAD, partial/final, finalizacja, limity, wybór backendu, konstrukcja WAV i HTTP,
błędy OpenRouter i dobór GPU przez skrypt. Dodatkowo sprawdzono poprawianie
partial przez rosnące żądania HTTP oraz odbieranie audio i zastępowanie starych
hipotez podczas wolnej odpowiedzi usługi. OpenRouter był symulowany.
Nie wykonano płatnego żądania, budowania obrazów ani inferencji na fizycznym GPU.

Testy deweloperskie:

```bat
python -m pip install -r requirements-test.txt
python -m pytest -q
```
