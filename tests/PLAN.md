# Testy głosowe na publicznej stronie InPost

Zakres: prawdziwa strona https://inpost.pl/, izolowany profil Chrome for Testing,
syntetyczny polski WAV jako mikrofon, zbudowana wtyczka, rzeczywisty backend
na localhost:8787, STT i model akcji z lokalnej konfiguracji.

Przypadki i oczekiwane efekty: `cases.json`. Każdy przypadek startuje ze świeżego
profilu i pustego formularza. Testy nie wysyłają numeru przesyłki do wyszukiwarki
śledzenia, nie logują się i nie wykonują zamówień.

Sprawdzamy osobno:
1. Czy wtyczka załadowała się na rzeczywistej stronie.
2. Czy pobrała audio z wirtualnego mikrofonu i wywołała STT.
3. Jaki tekst i odpowiedź modelu akcji otrzymała.
4. Czy DOM/URL spełnia oczekiwany warunek i czy agent wrócił do stanu idle.

Przejście całego testu wymaga poprawnego końcowego DOM/URL oraz zgodnego
komunikatu dla testów bez akcji. Sam komunikat „kliknąłem” nie jest dowodem sukcesu.
Porównujemy konkretne pola i adres, pomijając reklamy i animacje.

Raport zawiera stan przed i po, transkrypcję, odpowiedzi API, komunikaty agenta,
czas i zrzuty ekranu. Wyniki, WAV i profile są w ignorowanym `test-artifacts/inpost/`.
Raport nie zapisuje kluczy API.

Ograniczenia: głos syntetyczny nie obejmuje akcentów, mikrofonów i hałasu.
Nie testujemy statusu prawdziwej przesyłki bez numeru testowego. Na stronie
ogłoszono przerwę serwisową 4.10.2026 od 00:00 do 08:00; dostępność usług
zewnętrznych traktujemy osobno od jakości rozszerzenia.

Uruchomienie z katalogu repo (PowerShell):

```powershell
& extension/e2e/inpost-live/generate-audio.ps1
$env:CHROMIUM_BIN = 'C:\sciezka\do\chrome-for-testing\chrome.exe'
node extension/e2e/inpost-live/run.mjs
node extension/e2e/inpost-live/report.mjs
```

Runner buduje osobne `extension/dist-e2e`. Wymaga uruchomionego backendu w trybie
`STT_MODE=whisper` z prawdziwym API (testy zużywają środki dostawcy).
