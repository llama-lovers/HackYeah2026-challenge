import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from './messages.pl.ts';
import type { RejectReason } from './validate.ts';
test('sensitive-field refusal gives a reason and trusted-person next step', () => {
  assert.equal(m.rejectionText('sensitive_fill'),'Tego pola nie wypełniam, bo jest na dane poufne. Wypełnij je samodzielnie albo poproś o pomoc zaufaną osobę.');
});
test('announces validated actions and unchanged effects in exact Polish', () => {
  assert.equal(m.clickPre('Znajdź'), 'Klikam Znajdź.');
  assert.equal(m.fillPre('Wpisz numer przesyłki'), 'Wpisuję w pole Wpisz numer przesyłki.');
  assert.equal(m.noChange('click', 'Szukaj'), 'Kliknąłem Szukaj, ale na stronie nic się nie zmieniło.');
  assert.equal(m.noChange('fill', 'Numer'), 'Wpisałem tekst w pole Numer, ale na stronie nic się nie zmieniło.');
  assert.equal(m.effectFallback('click', 'Znajdź'), 'Kliknąłem Znajdź. Strona się zmieniła, ale nie udało mi się jej opisać. Powiedz „co tu jest”, żeby ją opisać.');
  assert.equal(m.effectFallback('fill', 'Numer'), 'Wpisałem tekst w pole Numer. Strona się zmieniła, ale nie udało mi się jej opisać. Powiedz „co tu jest”, żeby ją opisać.');
});
test('every rejection is spoken and unsafe actions require confirmation', () => {
  const reasons: RejectReason[] = ['unknown_action', 'not_found', 'stale', 'hidden', 'disabled', 'role_mismatch', 'sensitive_fill', 'empty_text', 'too_long', 'needs_confirmation', 'irreversible', 'unconfirmed'];
  for (const reason of reasons) assert.match(m.rejectionText(reason), /.+\.$/u);
  for (const reason of ['needs_confirmation', 'irreversible'] as const) assert.equal(m.rejectionText(reason), 'Tej akcji nie wykonam bez potwierdzenia. Powiedz polecenie jeszcze raz.');
});
test('confirmation prompt names the exact control without echoing typed text', () => {
  const prompt = (m as any).confirmPrompt;
  assert.equal(prompt?.('click', 'Zapłać', 'irreversible'), 'Chcę kliknąć „Zapłać”. Potwierdzasz? Powiedz tak albo nie.');
  assert.equal(prompt('fill', 'Uwagi', 'model_flag'), 'Chcę wpisać tekst w pole „Uwagi”. Potwierdzasz? Powiedz tak albo nie.');
  assert.equal(prompt('click', 'Zapłać', 'irreversible', 'za zamówienie'), 'Chcę kliknąć „Zapłać”, za zamówienie. Potwierdzasz? Powiedz tak albo nie.');
});
test('consent prompt informs the user and closing the dialog has a local effect', () => {
  assert.equal(m.confirmPrompt('click', 'ZAAKCEPTUJ WSZYSTKO', 'consent'), 'Chcę kliknąć „ZAAKCEPTUJ WSZYSTKO” w oknie zgody na pliki cookie. Potwierdzasz? Powiedz tak albo nie.');
  const action = { kind: 'click' as const, name: 'ZAAKCEPTUJ WSZYSTKO', role: 'button' };
  const diff = { added: [], removed: ['button ZAAKCEPTUJ WSZYSTKO'], changed: [], alerts: [] };
  const local = m.localEffect as any;
  assert.equal(local(action, diff, 'consent'), 'Kliknąłem ZAAKCEPTUJ WSZYSTKO. Okno zgód zostało zamknięte.');
  assert.equal(local(action, { ...diff, title: { before: 'T', after: 'Polityka' } }, 'consent'), 'Kliknąłem ZAAKCEPTUJ WSZYSTKO. Jesteś teraz na stronie Polityka.');
  assert.equal(local(action, { ...diff, alerts: ['Komunikat strony.'] }, 'consent'), 'Kliknąłem ZAAKCEPTUJ WSZYSTKO. Strona informuje: Komunikat strony.');
});
test('none response collapses whitespace, caps code points and supplies fallback', () => {
  assert.equal(m.noneSay(' '), 'Nie rozumiem polecenia. Powiedz je inaczej.');
  assert.equal(m.noneSay(' a\n b '), 'a b');
  assert.equal(Array.from(m.noneSay('😀'.repeat(400))).length, 300);
});
test('agent constants contain no digits and model-only messages speak numbers', () => {
  for (const [name, value] of Object.entries(m)) if (typeof value === 'string') assert.doesNotMatch(value, /[0-9]/, name);
  assert.equal(m.noneSay('Do zapłaty 349 zł.'), 'Do zapłaty trzysta czterdzieści dziewięć złotych.');
  const page = { kind: 'status', title: 'Status 12345678', description: '349 zł do 04.10.2026. Numer 44051401359.' } as const;
  assert.equal(m.statusSpeech(page), 'Status na stronie: ' + page.title + '. ' + page.description);
});
test('long status quote is a bounded verbatim prefix with an announced cut', () => {
  const description = 'Pierwsze zdanie. ' + '😀 opis '.repeat(100);
  const said = m.statusSpeech({ kind: 'status', title: 'W drodze', description });
  const note = ' Dalszy opis jest na stronie.';
  assert(said.endsWith(note));
  const quote = said.slice(0, -note.length);
  assert(Array.from(quote).length <= 400);
  assert.equal(quote, 'Status na stronie: W drodze. Pierwsze zdanie.');
  assert(('Status na stronie: W drodze. ' + description).startsWith(quote));
  for (const d of ['słowo '.repeat(120), '😀'.repeat(600)]) {
    const s = m.statusSpeech({ kind: 'error', title: '', description: d });
    assert(s.endsWith(note)); assert(Array.from(s.slice(0, -note.length)).length <= 400);
    assert(('Strona informuje: ' + d).startsWith(s.slice(0, -note.length)));
  }
  const noSentence = m.statusSpeech({ kind: 'status', title: 'W drodze', description: 'opis '.repeat(200) });
  assert(noSentence.startsWith('Status na stronie: W drodze. opis opis'));
  assert(Array.from(noSentence.slice(0, -note.length)).length <= 400);
});
test('local effect describes observed transitions alerts text and controls', () => {
  const f = (m as any).localEffect;
  const action = { kind: 'click', name: 'Znajdź', role: 'button' };
  const empty = { added: [], removed: [], changed: [], alerts: [] };
  assert.equal(f?.(action, empty), m.noChange('click', 'Znajdź'));
  assert.equal(f(action, { ...empty, path: { before: '/', after: '/x' }, title: { before: '', after: 'Wyniki' } }), 'Kliknąłem Znajdź. Jesteś teraz na stronie Wyniki.');
  assert.equal(f(action, { ...empty, alerts: ['Cena 349 zł.'] }), 'Kliknąłem Znajdź. Strona informuje: Cena 349 zł.');
  assert.equal(f(action, { ...empty, added: ['button Pomoc', 'W drodze 12345678'] }), 'Kliknąłem Znajdź. Na stronie pojawiło się: W drodze 12345678.');
  assert.equal(f(action, { ...empty, added: ['button Pomoc'] }), 'Kliknąłem Znajdź. Strona się zmieniła.');
});
test('numbered choices speak DOM names and bounded number-only reprompts', async () => {
  const m: any = await import('./messages.pl.ts');
  const options = ['Krakowa','Gdańska','Poznania'].map(city => ({id:city,role:'button',name:'Szczegóły paczki z '+city}));
  assert.equal(m.choicePrompt?.(options),'Pasuje kilka elementów. Jeden: Szczegóły paczki z Krakowa. Dwa: Szczegóły paczki z Gdańska. Trzy: Szczegóły paczki z Poznania. Który? Powiedz numer.');
  assert.equal(m.choiceReprompt(2),'Powiedz jeden albo dwa.');
  assert.equal(m.choiceReprompt(3),'Powiedz jeden, dwa albo trzy.');
});

// OUT-08: every failure seam has fixed, bounded Polish text with a concrete next step, and none of it can carry raw diagnostics.
const NEXT_STEP = /(?:Spróbuj|Powiedz|Naciśnij|Otwórz|Odśwież|Podłącz|Sprawdź|Poproś|Zapytaj|Wypełnij|Włącz|Zamknij|Poczekaj|Wybierz)/u;
const REJECT_REASONS = ['unknown_action', 'not_found', 'stale', 'hidden', 'disabled', 'role_mismatch', 'sensitive_fill', 'empty_text', 'too_long', 'needs_confirmation', 'irreversible', 'unconfirmed'] as const;
const FAILURE_KINDS = ['blocked', 'timeout', 'network', 'not_configured', 'invalid_output', 'unavailable'] as const;
const SEAMS = ['assistant', 'explore', 'actions'] as const;
const recoveryMessages = (): [string, string][] => [
  ...Object.entries(m.STT_FAILURES), ...Object.entries(m.MIC_FAILURES),
  ...REJECT_REASONS.map((r): [string, string] => ['reject:' + r, m.rejectionText(r)]),
  ...FAILURE_KINDS.flatMap(k => SEAMS.map((seam): [string, string] => [`${k}/${seam}`, m.failureText(k, seam)])),
  ['effect_unknown', m.EFFECT_UNKNOWN], ['effect_fallback_click', m.effectFallback('click', 'Znajdź')], ['effect_fallback_fill', m.effectFallback('fill', 'Numer')],
  ['action_failed', m.ACTION_FAILED], ['snapshot_failed', m.SNAPSHOT_FAILED], ['storage', m.STORAGE_FAILED], ['pipeline', m.PIPELINE_FAILED], ['nothing_heard', m.NOTHING_HEARD],
  ['page_unsupported', m.PAGE_UNSUPPORTED], ['page_access', m.PAGE_ACCESS_FAILED], ['empty_page', m.PAGE_EMPTY], ['explore', m.EXPLORE_FAILED], ['actions', m.ACTIONS_FAILED], ['assistant', m.ASSISTANT_FAILED],
];
test('every failure seam is short plain Polish with a concrete next step', () => {
  const all = recoveryMessages();
  assert(all.length >= 40);
  for (const [name, text] of all) {
    assert(text.trim().length > 0, name);
    assert(Array.from(text).length <= 260, `${name} is bounded (${text.length})`);
    assert(NEXT_STEP.test(text), `${name} names a next action: ${text}`);
    assert(!/[<>{}\[\]]|https?:|undefined|null|NaN|Error|Exception/u.test(text), `${name} carries no diagnostics: ${text}`);
    assert(/^[A-ZĄĆĘŁŃÓŚŹŻ]/u.test(text) && /[.!?”]$/u.test(text), `${name} reads as sentences`);
  }
});
test('failure categories map to distinct fixed text and never to input-dependent text', () => {
  for (const k of FAILURE_KINDS) for (const seam of SEAMS) assert.equal(m.failureText(k, seam), m.failureText(k, seam));
  assert.equal(m.failureText('blocked', 'assistant'), m.SNAPSHOT_FAILED);
  assert.equal(m.failureText('not_configured', 'explore'), m.NOT_CONFIGURED);
  assert.equal(m.failureText('invalid_output', 'assistant'), m.ASSISTANT_INVALID);
  assert.equal(m.failureText('invalid_output', 'explore'), m.EXPLORE_FAILED);
  assert.equal(m.failureText('unavailable', 'actions'), m.ACTIONS_FAILED);
  assert.notEqual(m.STT_FAILURES.stt_timeout, m.STT_FAILURES.stt_failed);
  assert.notEqual(m.STT_FAILURES.network, m.STT_FAILURES.stt_failed);
});
test('an uncertain effect admits the uncertainty and sends the user to a read-only check, never to a blind repeat', () => {
  for (const text of [m.EFFECT_UNKNOWN, m.effectFallback('click', 'Zapłać'), m.effectFallback('fill', 'Numer')]) {
    assert(text.includes('co tu jest'), text);
    assert(!/jeszcze raz|powtórz|ponów/iu.test(text), text);
  }
  assert(/nie mogę potwierdzić|nie udało mi się/u.test(m.EFFECT_UNKNOWN + m.effectFallback('click', 'X')));
});
