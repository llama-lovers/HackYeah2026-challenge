import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from './messages.pl.ts';
import type { RejectReason } from './validate.ts';
test('announces validated actions and unchanged effects in exact Polish', () => {
  assert.equal(m.clickPre('Znajdź'), 'Klikam Znajdź.');
  assert.equal(m.fillPre('Wpisz numer przesyłki'), 'Wpisuję w pole Wpisz numer przesyłki.');
  assert.equal(m.noChange('click', 'Szukaj'), 'Kliknąłem Szukaj, ale na stronie nic się nie zmieniło.');
  assert.equal(m.noChange('fill', 'Numer'), 'Wpisałem tekst w pole Numer, ale na stronie nic się nie zmieniło.');
  assert.equal(m.effectFallback('click', 'Znajdź'), 'Kliknąłem Znajdź. Strona się zmieniła, ale nie udało mi się jej opisać.');
  assert.equal(m.effectFallback('fill', 'Numer'), 'Wpisałem tekst w pole Numer. Strona się zmieniła, ale nie udało mi się jej opisać.');
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
