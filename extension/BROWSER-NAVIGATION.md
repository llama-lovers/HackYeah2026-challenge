# Głosowe otwieranie stron i kart

Po przebudowaniu załaduj `extension/dist` lub przeładuj istniejącą wtyczkę w
`chrome://extensions`, a następnie odśwież otwartą stronę.

Przykładowe polecenia:

- „Przejdź na inpost.pl” — zmienia adres bieżącej karty.
- „Wejdź na stronę wikipedia.org” — zmienia adres bieżącej karty.
- „Otwórz wikipedia.org w nowej karcie” — otwiera i aktywuje nową kartę.
- „Otwórz nową kartę z adresem https://inpost.pl/cenniki”.
- „Otwórz nową kartę” — otwiera pustą kartę. Kolejnym poleceniem można podać adres.
- „Przejdź na inpost kropka pe el” — rozpoznaje dyktowane kropki i końcówkę „pe el”.
- „Wyszukaj paczkomaty w Warszawie” — otwiera wyniki Google, również z pustej karty Chrome.
- „Chcę wyszukać czerwone koty” i „wyszukaj mi czerwone koty”.
- Na stronie Google: „Wpisz czerwone koty w pole wyszukiwania i wyszukaj” — wykonuje całe wyszukiwanie.
- „Wyszukaj koty w nowej karcie”.
- „Wpisz inpost.pl w pasek adresu” — przechodzi na podany adres.
- „Wpisz czerwone koty w pasek adresu” — uruchamia wyszukiwanie Google.

Nagrywanie: pierwsze naciśnięcie Alt+Shift+A rozpoczyna, drugie kończy.
Na pustej karcie komunikaty są odczytywane przez Chrome TTS. Na zwykłych stronach
wtyczka uzyskuje dostęp do bieżącej strony przy następnym użyciu skrótu.

Adresy muszą zawierać domenę lub pełny URL HTTP/HTTPS. Brak protokołu oznacza
HTTPS. Polecenia wyszukiwania budują adres wyników Google z zakodowanym zapytaniem,
bez klikania pola nowej karty Chrome. Niepoprawne adresy, adresy z loginem/hasłem oraz inne protokoły
są odrzucane. Polecenia typu „otwórz menu” nadal trafiają do obsługi elementów strony.

Polecenia nawigacji są rozpoznawane lokalnie z transkrypcji wypowiedzi użytkownika,
bez wywoływania modelu akcji. Otwieranie adresu używa chrome.tabs.update/create.
Model nie otrzymuje nowej akcji pozwalającej otwierać adresy pochodzące z treści strony.
Przed przejściem wtyczka usuwa wcześniejsze oczekujące potwierdzenie i bufor powtórzenia.
Komunikat „przechodzę” oznacza rozpoczęcie nawigacji, nie potwierdzenie załadowania strony.

Od wersji 0.2.0 skrypt strony ładuje się automatycznie również na google.com/google.pl
(z www i bez www). Po przeładowaniu rozszerzenia odśwież wcześniej otwartą kartę Google.
Polecenia dotyczące pola wyszukiwania są rozpoznawane lokalnie tylko po potwierdzeniu,
że bieżący dokument jest stroną wyszukiwania Google; na innych stronach pozostają
zwykłymi poleceniami wypełnienia pola.

Bezpośrednie wyszukiwanie nie wywołuje modelu `/api/action`. Jego przebieg widać
w logu backendu jako `browser action search -> requested/started/failed` i
`POST /api/browser-action`. Te wpisy nie zawierają tekstu zapytania.
`started` oznacza, że Chrome przyjął nawigację. CAPTCHA lub błąd sieci może nadal
uniemożliwić wyświetlenie wyników; nie obchodzimy zabezpieczeń Google.

Testy: navigation.test.ts, browser-search.test.ts, pipeline.test.ts oraz scenariusze
E2E browser-navigation i browser-search.

Test prawdziwej strony głównej Google z syntetycznym WAV jako mikrofonem i
rzeczywistym Whisperem:

```powershell
& extension/e2e/google-live/generate-audio.ps1
node extension/e2e/google-live/run.mjs
```

Wymaga uruchomionego API localhost:8787 i Chrome for Testing. Domyślnie runner
używa kopii w test-artifacts/inpost/tools/chrome-win64/chrome.exe; inną ścieżkę
można podać przez CHROMIUM_BIN. Wyniki i zrzuty są w test-artifacts/google-live.
