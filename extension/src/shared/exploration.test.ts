import test from 'node:test';
import assert from 'node:assert/strict';
import { parseExploreCommand, decodeSummary } from './exploration.ts';
test('complete exploration phrases are recognised after folding, other utterances are not', () => {
  for (const text of ['co tu jest?', 'Co tu jest', 'CO TU JEST!', 'co jest na tej stronie?', 'Co to za strona.']) assert.equal(parseExploreCommand(text), 'summary', text);
  for (const text of ['co mogę zrobić?', 'Co mogę zrobić na tej stronie', 'jakie są dostępne akcje', 'co jeszcze mogę zrobić']) assert.equal(parseExploreCommand(text), 'actions', text);
});
test('a longer utterance that merely contains the phrase stays on the action route', () => {
  // 'opisz stronę' deliberately keeps its Phase 1 route through the action model.
  for (const text of ['opisz stronę', 'wpisz co tu jest w pole numer', 'kliknij co mogę zrobić', 'co to jest captcha', 'co tu jest zapłać', 'gdzie jest pole hasła', '', 'co']) assert.equal(parseExploreCommand(text), null, text);
});
test('a summary of one or two complete sentences is accepted and keeps Polish letters', () => {
  assert.deepEqual(decodeSummary({ sentences: ['To strona śledzenia przesyłek.'], candidate_ids: [] }), ['To strona śledzenia przesyłek.']);
  assert.deepEqual(decodeSummary({ sentences: [' Pierwsze zdanie. ', 'Czy są pola? '], candidate_ids: [] }), ['Pierwsze zdanie.', 'Czy są pola?']);
});
test('null, empty, extra-field, excessive, fragment and mixed output is rejected', () => {
  const bad: unknown[] = [null, undefined, 'tekst', [], 42,
    { sentences: null, candidate_ids: [] }, { sentences: [], candidate_ids: [] }, { sentences: [''], candidate_ids: [] }, { sentences: ['   '], candidate_ids: [] },
    { sentences: ['Zdanie.'], candidate_ids: [], action: 'click' }, { sentences: ['Zdanie.'] }, { candidate_ids: [] },
    { sentences: ['A.', 'B.', 'C.'], candidate_ids: [] }, { sentences: ['Zdanie bez końca'], candidate_ids: [] },
    { sentences: ['Zdanie.'], candidate_ids: ['e1'] }, { sentences: ['Zdanie.\nDrugie.'], candidate_ids: [] },
    { sentences: [5], candidate_ids: [] }, { sentences: ['x'.repeat(301) + '.'], candidate_ids: [] }, { sentences: 'Zdanie.', candidate_ids: [] }];
  for (const value of bad) assert.equal(decodeSummary(value), null, JSON.stringify(value));
});
import { decodeActions, decodeRecheck, ACTION_CAPS } from './exploration.ts';
import { actionsList } from './messages.pl.ts';
test('suggested ids must be a unique, non-empty, in-cap subset of the offered ids', () => {
  const offered = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'];
  assert.deepEqual(ACTION_CAPS, { concise: 3, standard: 4, detailed: 5 });
  assert.deepEqual(decodeActions({ sentences: [], candidate_ids: ['e2', 'e1'] }, offered, 4), ['e2', 'e1']);
  assert.deepEqual(decodeActions({ sentences: [], candidate_ids: ['e1'] }, offered, 4), ['e1']);
  const bad: unknown[] = [null, [], { sentences: [], candidate_ids: [] }, { sentences: [], candidate_ids: ['e1', 'e1'] }, { sentences: [], candidate_ids: ['e999'] },
    { sentences: [], candidate_ids: ['e1', 'e2', 'e3', 'e4', 'e5'] }, { sentences: ['Zdanie.'], candidate_ids: ['e1'] }, { sentences: [], candidate_ids: [1] },
    { sentences: [], candidate_ids: ['e1'], action: 'click' }, { candidate_ids: ['e1'] }, { sentences: [], candidate_ids: 'e1' }];
  for (const value of bad) assert.equal(decodeActions(value, offered, 4), null, JSON.stringify(value));
});
test('the recheck reply may only return suggested candidates, once each', () => {
  const c = (id: string) => ({ id, role: 'button', name: 'X' });
  assert.deepEqual(decodeRecheck({ ok: true, candidates: [c('e1')] }, ['e1', 'e2']), [c('e1')]);
  assert.deepEqual(decodeRecheck({ ok: true, candidates: [] }, ['e1']), []);
  assert.equal(decodeRecheck({ ok: false, reason: 'stale' }, ['e1']), 'stale');
  for (const value of [null, 5, {}, { ok: true }, { ok: true, candidates: [c('e9')] }, { ok: true, candidates: [c('e1'), c('e1')] }, { ok: true, candidates: [{ id: 'e1' }] }, { ok: false, reason: 'x' }]) assert.equal(decodeRecheck(value, ['e1']), null, JSON.stringify(value));
});
test('actions are phrased from local role and name only and read naturally in Polish', () => {
  const items = [{ id: 'e1', role: 'link', name: 'Szukaj' }, { id: 'e2', role: 'textbox', name: 'Wpisz numer przesyłki.' }, { id: 'e3', role: 'button', name: 'Znajdź' }];
  assert.equal(actionsList(items, false), 'Możesz otworzyć link Szukaj, wpisać tekst w pole Wpisz numer przesyłki i kliknąć przycisk Znajdź.');
  assert.equal(actionsList(items.slice(2), false), 'Możesz kliknąć przycisk Znajdź.');
  assert.equal(actionsList(items.slice(0, 2), true), 'Na początku strony możesz otworzyć link Szukaj i wpisać tekst w pole Wpisz numer przesyłki.');
});
test('summary text is made speakable for long digit groups', () => {
  assert.deepEqual(decodeSummary({ sentences: ['Numer to 12345678.'], candidate_ids: [] }), ['Numer to jeden dwa trzy cztery, pięć sześć siedem osiem.']);
});
