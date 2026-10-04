import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../../..');
const base = resolve(root, 'test-artifacts/inpost');
const cases = JSON.parse(await readFile(resolve(here, 'cases.json'), 'utf8'));
const runs = (await readdir(base)).filter(name=>name.startsWith('run-')).sort();
const attempts = [];
for(const run of runs) {
  const data = await readFile(resolve(base,run,'results.json'),'utf8').catch(()=>null);
  if(data) for(const result of JSON.parse(data)) attempts.push({...result, run});
}
const link = path => resolve(path).replaceAll('\\','/');
const grouped = cases.map(test=>({test, attempts:attempts.filter(a=>a.id===test.id)})).filter(group=>group.attempts.length);
const passed = grouped.filter(group=>group.attempts.every(a=>a.status==='PASS')).length;
const commit = spawnSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).stdout.trim();
const lines = [
  '# Raport testów głosowych InPost', '',
  `Wygenerowano: ${new Intl.DateTimeFormat('pl-PL',{dateStyle:'full',timeStyle:'long',timeZone:'Europe/Warsaw'}).format(new Date())}.`,
  `Kod: main, commit ${commit}.`, '',
  `**${passed}/${grouped.length} scenariuszy zaliczonych. ${attempts.length} wykonań, w tym powtórzenia.**`, '',
  'Prawdziwa strona https://inpost.pl/, Chrome for Testing 154.0.8037.92, izolowane profile, polski głos Microsoft Paulina Desktop. Syntetyczny WAV podany jako mikrofon; wtyczka nagrywa WebM/Opus, backend wykonuje Silero/preprocessing, a OpenRouter rzeczywiste STT i wybór akcji. Wyzwolenie nagrywania przez testowy hook zamiast fizycznego skrótu klawiaturowego. Żadne odpowiedzi STT ani modeli nie były podstawiane.', '',
  'Konfiguracja podczas tych testów: STT_MODE=whisper, STT_MODEL=openai/whisper-large-v3, CHAT_MODEL=anthropic/claude-sonnet-5.5. Testy działały na istniejącym backendzie localhost:8787.', '',
  '| Scenariusz | Wynik | Próby | Oczekiwany efekt |', '|---|---|---:|---|',
];
for(const {test,attempts:items} of grouped) lines.push(`| ${test.id} | ${items.every(a=>a.status==='PASS')?'PASS':'FAIL'} | ${items.length} | ${test.expected} |`);
lines.push('', '## Wykryte problemy', '',
  '1. **Powtarzalne błędne wypełnienie numeru.** W obu próbach nagrania „Wpisz siedem osiem dziewięć zero jeden dwa trzy cztery w pole numeru przesyłki” endpoint STT zwrócił „Wpisz 789 -01234 w pole numeru przesyłki.” Model akcji otrzymał już tekst z separatorem i wpisał `789 -01234`. Asercja wymagała `78901234`. To błąd treści w polu, mimo odpowiedzi HTTP 200. Sam raport nie rozstrzyga, czy separator powstał w surowym Whisperze, czy podczas postprocessingu timestampów.', '',
  '2. **Niezgodny komunikat o długości numeru.** Agent mówi, że numer ma osiem albo dwadzieścia cztery cyfry. Rzeczywisty formularz strony głównej pokazuje „Podaj jeden numer przesyłki zawierający 24 cyfry”. Test wypełnienia ośmioma cyframi sprawdzał wyłącznie wierne przepisanie, a nie akceptację numeru przez serwis. Osobny test 24 cyfr przeszedł: w polu znalazło się dokładnie `123456789012345678901234`.', '',
  'Do dalszej diagnozy: porównać surowe `text`/`words` dostawcy z końcową transkrypcją; dla pola przesyłki walidować cyfry i separatory deterministycznie oraz dopasować komunikat o długości do aktualnego formularza. Wykryte problemy pozostają do naprawienia.', '',
  '## Dowody', '',
);
for(const {test,attempts:items} of grouped) {
  lines.push(`### ${test.id}`, '', `Audio: [${test.id}.wav](${link(resolve(base,'audio',test.id+'.wav'))})`, '');
  for(const [index,result] of items.entries()) {
    const dir = resolve(base,result.run,test.id);
    lines.push(`Próba ${index+1}: **${result.status}**, ${(result.durationMs/1000).toFixed(1)} s (łącznie z uruchomieniem przeglądarki, ładowaniem strony i odtwarzaniem audio).`, '',
      `- Transkrypcja: ${result.transcript ? JSON.stringify(result.transcript) : '(pusta)'}`,
      `- URL po: ${result.after?.url ?? '(brak)'}`,
      `- Wartość pola po: ${JSON.stringify(result.after?.parcel ?? null)}`,
      `- [Wynik JSON](${link(resolve(dir,'result.json'))}) · [Przed](${link(resolve(dir,'before.png'))}) · [Po](${link(resolve(dir,'after.png'))})`, '');
  }
}
lines.push('## Ograniczenia', '',
  '- Strona pokazywała przerwę serwisową 4.10.2026, 00:00–08:00. Przejścia do wyszukiwarki i cennika były mimo to dostępne.',
  '- Nie wysyłano formularza z numerem, nie sprawdzano rzeczywistej przesyłki, nie wykonywano zakupów ani logowania.',
  '- Wyniki dotyczą jednego syntetycznego głosu i desktopowego viewportu. Nie weryfikują realnego mikrofonu, hałasu, akcentów, skrótu systemowego ani czytnika ekranu.',
  '- Poza nieudanym scenariuszem wykonanym dwukrotnie testy miały po jednej próbie; nie jest to miara statystycznej skuteczności modeli.', '',
  '## Odtworzenie', '',
  `Plan i instrukcja: [PLAN.md](${link(resolve(here,'PLAN.md'))}).`,
  'Po uruchomieniu testów wygeneruj raport poleceniem `node extension/e2e/inpost-live/report.mjs` z katalogu repo.', '',
);
await writeFile(resolve(base,'REPORT.md'),lines.join('\n'));
await writeFile(resolve(base,'summary.json'),JSON.stringify({commit,passed,total:grouped.length,attempts},null,2));
console.log(resolve(base,'REPORT.md'));
