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
test('summary text is made speakable for long digit groups', () => {
  assert.deepEqual(decodeSummary({ sentences: ['Numer to 12345678.'], candidate_ids: [] }), ['Numer to jeden dwa trzy cztery, pięć sześć siedem osiem.']);
});
