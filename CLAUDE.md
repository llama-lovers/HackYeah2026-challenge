# CLAUDE.md

Wytyczne dla Claude'a (i członków zespołu) pracującego nad tym projektem. Czytaj w całości przed zmianami w kodzie.

> Pozycje oznaczone **[DO POTWIERDZENIA]** to założenia robocze. Zespół powinien je zatwierdzić lub poprawić.

## 1. Czym jest projekt

Wtyczka do Chrome (Manifest V3): **głosowy agent dla osób niewidomych i słabowidzących**, skupiony na **polskich serwisach i e-usługach** (e-urzędy, banki, poczta, sklepy, przesyłki).

Użytkownik rozmawia z agentem głosem. Agent rozumie stronę, opisuje ją na żądanie, wykonuje polecenia (klikanie, wypełnianie formularzy, nawigacja) i **zawsze mówi, co zrobił i jaki był skutek**.

Powstaje na hackathonie, więc liczy się działające demo jednego scenariusza, a nie szeroki zakres.

## 2. Pozycjonowanie i wyróżniki

Istnieją już podobne projekty (m.in. Wayfinder, Diamond Access AI, AriaPilot, Screen Agent, Vision Assistant Pro dla NVDA). Samo „głos + agent + czytanie strony” **nie jest** wyróżnikiem. Nasze wyróżniki:

1. **Polski język i polskie serwisy**: jeden dopracowany scenariusz end-to-end **[DO POTWIERDZENIA: który? np. status przesyłki, wniosek w e-urzędzie, sprawdzenie salda]**.
2. **Potwierdzanie skutków, nie tylko zamiarów**: np. „Kliknąłem Dodaj do koszyka. W koszyku jest 1 produkt za 349 zł.”
3. **Mówienie głosem czytnika ekranu użytkownika** (komunikaty przez region ARIA live), zamiast własnego, wolniejszego głosu. Własny TTS tylko jako tryb awaryjny.
4. **Ochrona danych wrażliwych**: hasła, PESEL, numery kont i kart nigdy nie trafiają do modelu.
5. **Testy z prawdziwym użytkownikiem niewidomym**, choćby krótkie, i pokazanie ich w prezentacji.

Każda decyzja projektowa powinna wzmacniać jeden z tych punktów. Jeśli coś ich nie wzmacnia, prawdopodobnie jest poza zakresem.

## 3. Zasady nienegocjowalne

### Bezpieczeństwo akcji
- **Akcje nieodwracalne wymagają głosowego potwierdzenia „tak”**: płatności, wysyłka formularzy, usuwanie, zmiana danych konta, zgody prawne. Agent najpierw mówi, co zamierza zrobić, i czeka.
- Agent **nigdy** samodzielnie nie wprowadza haseł, kodów SMS/BLIK, ani nie przechodzi captcha. W takich miejscach zatrzymuje się, mówi dlaczego i proponuje pomoc człowieka.
- Przy wątpliwości co do elementu (kilka pasujących przycisków, niejasna etykieta) agent **pyta**, zamiast zgadywać.

### Prywatność
- Pola wrażliwych danych (`type=password`, pola rozpoznane jako PESEL, IBAN, numer karty, CVV, kody jednorazowe) są **maskowane przed wysłaniem do modelu**. Zrzuty ekranu z takich stron nie są wysyłane bez zasłonięcia tych pól.
- Do modelu wysyłamy minimum: preferuj drzewo dostępności / uproszczony DOM zamiast pełnego HTML i zrzutów ekranu.
- Żadnych kluczy API w kodzie wtyczki ani w repozytorium. Konfiguracja przez zmienne środowiskowe lub backend-proxy **[DO POTWIERDZENIA]**.
- Nie logujemy treści stron ani poleceń użytkownika poza lokalnym debugiem wyłączonym domyślnie.

### Dostępność samego produktu
Produkt dla osób niewidomych musi być sam w pełni dostępny:
- Cała obsługa wtyczki (włączenie, ustawienia, błędy) działa **bez myszy i bez patrzenia na ekran**: skróty klawiszowe, poprawne role i etykiety ARIA, logiczna kolejność fokusu.
- Żadna informacja nie jest przekazywana wyłącznie wizualnie (kolor, ikona, animacja).
- Każdy nowy element UI testujemy z czytnikiem ekranu (NVDA na Windows lub VoiceOver na macOS) zanim uznamy go za gotowy.

## 4. Zasady komunikacji agenta z użytkownikiem

- **Krótko.** Za dużo mówienia jest gorsze niż za mało. Domyślnie jedno–dwa zdania.
- **Najpierw zapowiedź, potem skutek** przy akcjach: „Klikam Zaloguj.” → „Jesteś na stronie logowania, są dwa pola: e-mail i hasło.”
- **Tryb „co tu jest?”**: streszczenie strony i lista możliwych działań na żądanie, zamiast czytania liniowego.
- **Przerywanie (barge-in)**: użytkownik może powiedzieć „stop” lub nacisnąć skrót w dowolnym momencie, a agent natychmiast przestaje mówić i działać.
- **Sygnały dźwiękowe** zamiast gadania dla stanów rutynowych: „pracuję”, „gotowe”, „potrzebuję potwierdzenia”. Dźwięki muszą być krótkie, różne i możliwe do wyłączenia.
- Komunikaty po polsku, prostym językiem, bez żargonu technicznego. Liczby i kwoty czytelnie („trzysta czterdzieści dziewięć złotych”).
- Błędy mówimy wprost i z propozycją dalszego kroku, nigdy ciszą.

## 5. Architektura (propozycja robocza) [DO POTWIERDZENIA]

```
Głos użytkownika
   │  (Web Speech API lub Whisper)
   ▼
Wtyczka Chrome (MV3)
   ├─ content script: pobiera drzewo dostępności / uproszczony DOM,
   │                  maskuje pola wrażliwe, wykonuje akcje (click, type, scroll)
   ├─ service worker: orkiestracja, komunikacja z backendem/modelem
   └─ warstwa mowy:  komunikaty → ARIA live region (głos czytnika użytkownika)
                      fallback → syntezator przeglądarkowy / TTS
   ▼
Model (Claude API): intencja użytkownika + stan strony → konkretna akcja
   │  zwraca ustrukturyzowaną odpowiedź (akcja, element, tekst do powiedzenia,
   │  czy wymaga potwierdzenia)
   ▼
Wykonanie akcji → odczyt nowego stanu strony → komunikat o skutku
```

Kluczowe decyzje:
- **Drzewo dostępności ma pierwszeństwo przed zrzutem ekranu.** Zrzut ekranu tylko wtedy, gdy elementy są nieopisane lub strona jest źle zbudowana, i z maskowaniem pól wrażliwych.
- Model nie wykonuje akcji bezpośrednio. Zwraca **ustrukturyzowaną propozycję**, a warstwa wtyczki ją waliduje (np. czy akcja jest nieodwracalna → wymagaj potwierdzenia).
- Wtyczka współpracuje z czytnikiem ekranu, nie zastępuje go. Unikamy kolizji głosów: mówimy tylko wtedy, gdy użytkownik się do nas zwrócił, albo przez ARIA live.

## 6. Zakres hackathonu

**W zakresie (MVP):**
- Jedna wtyczka Chrome z wejściem głosowym i skrótem klawiszowym (push-to-talk).
- Komendy: opis strony, „co mogę zrobić?”, klikanie po opisie, wypełnianie prostych pól, przewijanie.
- Jeden polski scenariusz demo działający niezawodnie **[DO POTWIERDZENIA]**.
- Potwierdzanie akcji nieodwracalnych i opisywanie skutków.
- Komunikaty przez ARIA live.

**Poza zakresem (na slajd „co dalej”):**
- Wspólna baza etykiet dla nieopisanych elementów współdzielona między użytkownikami.
- Obsługa wielu przeglądarek i urządzeń mobilnych.
- Integracja z Be My Eyes przy captcha.
- Pełna lokalna AI (offline).

## 7. Konwencje pracy

**Ogólne**
- Język komunikatów dla użytkownika: polski. Kod, nazwy zmiennych, komentarze techniczne i commity: angielski **[DO POTWIERDZENIA]**.
- Małe, częste commity. Jedna zmiana = jeden cel.
- Nie dodawaj zależności bez powodu. Na hackathonie każda zależność to ryzyko.
- Najpierw działający pionowy przekrój (głos → akcja → skutek), potem dopracowanie.

**Dla Claude'a**
- Przed większą zmianą przeczytaj istniejący kod i dopasuj się do jego stylu.
- Jeśli polecenie jest niejednoznaczne i zła decyzja kosztuje dużo (np. zmiana architektury), zapytaj. Przy drobnych sprawach wybierz rozsądną opcję i napisz, co wybrałeś.
- Nie dodawaj funkcji spoza zakresu z sekcji 6 bez wyraźnej prośby.
- Każdą zmianę dotyczącą akcji agenta sprawdź pod kątem sekcji 3: czy akcja nieodwracalna jest chroniona potwierdzeniem, czy dane wrażliwe są maskowane.
- Piszesz komunikaty głosowe? Trzymaj się zasad z sekcji 4 (krótko, najpierw zapowiedź, potem skutek).

## 8. Testowanie

- **Scenariusz demo**: skrypt ręczny krok po kroku, przechodzony przed każdym pokazem. Demo ma działać też przy słabym internecie, więc przygotuj plan B (nagranie lub tryb offline z gotowymi odpowiedziami).
- **Czytnik ekranu**: testy z NVDA (Windows) lub VoiceOver (macOS), włączonym równolegle z wtyczką.
- **Bezpieczeństwo**: przetestuj, że na stronie logowania i formularzach płatności dane wrażliwe nie trafiają do żądań do modelu (sprawdź w zakładce Network).
- **Użytkownik**: jeśli to możliwe, 15–30 minut z osobą niewidomą (np. przez Polski Związek Niewidomych lub lokalne grupy użytkowników NVDA). Zapisz obserwacje i wnioski. Trafią do prezentacji.

## 9. Prezentacja i demo

- Jedno zdanie pozycjonujące: *„Polski agent głosowy dla osób niewidomych, który mówi głosem twojego czytnika ekranu, potwierdza każdy skutek i nie wysyła twoich danych wrażliwych do chmury.”* **[DO DOPRACOWANIA]**
- Demo na żywo: jeden scenariusz, około 3 minut, bez improwizacji.
- Otwarcie wspomnij istniejące rozwiązania (Wayfinder, Diamond Access AI i inne) i pokaż, czym się różnimy. To buduje wiarygodność.
- Pokaż wnioski z testu z użytkownikiem, jeśli się odbył.

## 10. Otwarte pytania

- [ ] Który polski scenariusz jest głównym demo?
- [ ] Backend-proxy czy bezpośrednie wywołania modelu z wtyczki? (klucze API)
- [ ] Web Speech API czy Whisper do rozpoznawania mowy po polsku? (jakość vs. opóźnienie)
- [ ] Jaki TTS jako fallback? (przeglądarkowy vs. zewnętrzny)
- [ ] Kto z zespołu zajmuje się testami z użytkownikiem?
- [ ] Czy sprawdzić, czy Wayfinder jest open source i da się go wykorzystać lub zainspirować?
