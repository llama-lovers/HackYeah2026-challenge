import test from 'node:test';
import assert from 'node:assert/strict';
import { entriesSince, matchesSince } from './live-log.mjs';
test('announcements from an earlier turn never satisfy a later wait (WR-01)', () => {
  const log = ['Słucham.', 'Przetwarzam.', 'Klikam Znajdź.'];
  assert.equal(matchesSince(log, 0, 'Przetwarzam.'), true);
  assert.equal(matchesSince(log, log.length, 'Słucham.'), false);
  assert.equal(matchesSince(log, log.length, 'Przetwarzam.'), false);
  const next = [...log, 'Słucham.'];
  assert.equal(matchesSince(next, log.length, 'Słucham.'), true);
  assert.equal(matchesSince(next, log.length, 'Przetwarzam.'), false);
});
test('function predicates see only the entries after the mark', () => {
  const log = ['Jeszcze pracuję.', 'a', 'Jeszcze pracuję.'];
  assert.equal(matchesSince(log, 1, entries => entries.filter(s => s === 'Jeszcze pracuję.').length === 2), false);
  assert.deepEqual(entriesSince(log, 1), ['a', 'Jeszcze pracuję.']);
});
test('a restarted log (new document) is read from its start', () => {
  assert.equal(matchesSince(['Słucham.'], 5, 'Słucham.'), true);
});
