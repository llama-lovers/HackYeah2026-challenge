import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeScrollRequest, decodeScrollResult } from './protocol.ts';
import { VERBOSITY_LEVELS, DEFAULT_VERBOSITY, decodeVerbosity, decodeStoredVerbosity, moveVerbosity, parseConversationCommand, normalizePhrase, savesForReplay, makeReplay, decodeReplay, decodeAnnounceAck, MAX_REPLAY_CHARS } from './conversation.ts';

test('repeat is recognised only as a complete phrase, ignoring case, diacritics and punctuation', () => {
  for (const text of ['powtórz', 'Powtórz.', '  POWTÓRZ  to!  ', 'Powtórz, proszę', 'proszę powtórz', 'powiedz jeszcze raz', 'Co powiedziałeś?', 'powtorz']) {
    assert.deepEqual(parseConversationCommand(text), { kind: 'repeat' }, text);
  }
});
test('a repeat word inside ordinary dictation or another command is never a conversation command', () => {
  for (const text of ['wpisz powtórz w pole numer', 'kliknij powtórz', 'powtórz numer przesyłki 12345678', 'powtórz i kliknij Znajdź', 'nie powtarzaj', 'powtórzenie', '', '   ', 'co tu jest']) {
    assert.equal(parseConversationCommand(text), null, text);
  }
});
test('normalisation folds Polish letters and strips terminal punctuation only', () => {
  assert.equal(normalizePhrase('  Powtórz…? '), 'powtorz');
  assert.equal(normalizePhrase('Co  MÓWIŁEŚ?'), 'co mowiles');
});
test('only substantive output may become the replay buffer', () => {
  assert.deepEqual((['substantive', 'status', 'pre_action', 'replay'] as const).map(savesForReplay), [true, false, false, false]);
});
test('replay entries keep the exact Unicode text and are bounded', () => {
  const text = 'Zażółć gęślą jaźń. Złoty – „cudzysłów”, emoji 👍.';
  assert.deepEqual(makeReplay(7, 'doc-1', text), { tabId: 7, docId: 'doc-1', text });
  assert.equal(makeReplay(7, 'doc-1', 'x'.repeat(MAX_REPLAY_CHARS))?.text.length, MAX_REPLAY_CHARS);
  assert.equal(makeReplay(7, 'doc-1', 'x'.repeat(MAX_REPLAY_CHARS + 1)), undefined);
  assert.equal(makeReplay(7, 'doc-1', '   '), undefined);
  assert.equal(makeReplay(7, '', 'a'), undefined);
  assert.equal(makeReplay(7, undefined, 'a'), undefined);
  assert.equal(makeReplay(1.5, 'd', 'a'), undefined);
});
test('stored replay data is decoded, never trusted', () => {
  const good = { tabId: 7, docId: 'doc-1', text: 'Tekst.' };
  assert.deepEqual(decodeReplay(good), good);
  for (const bad of [null, undefined, 'x', [], {}, { ...good, extra: 1 }, { tabId: '7', docId: 'd', text: 't' }, { tabId: 7, docId: 1, text: 't' }, { tabId: 7, docId: 'd', text: 1 }, { tabId: 7, docId: 'd', text: '' }, { tabId: 7, docId: 'd', text: 'x'.repeat(MAX_REPLAY_CHARS + 1) }, { tabId: 7, docId: 'd' }]) {
    assert.equal(decodeReplay(bad), undefined, JSON.stringify(bad));
  }
});
test('an announce acknowledgement must name the document that spoke', () => {
  assert.equal(decodeAnnounceAck({ ok: true, docId: 'doc-1' }), 'doc-1');
  for (const bad of [undefined, null, { ok: true }, { ok: false, docId: 'd' }, { ok: true, docId: '' }, { ok: true, docId: 5 }, 'ok']) assert.equal(decodeAnnounceAck(bad), undefined);
});
test('shorter and longer are complete phrases only', () => {
  for (const text of ['krócej', 'Krócej.', 'mów krócej', 'proszę krócej', 'Krócej, proszę!']) assert.deepEqual(parseConversationCommand(text), { kind: 'verbosity', direction: 'shorter' }, text);
  for (const text of ['dokładniej', 'Dokładniej.', 'mów dokładniej', 'bardziej szczegółowo', 'Dokładniej, proszę!']) assert.deepEqual(parseConversationCommand(text), { kind: 'verbosity', direction: 'longer' }, text);
  for (const text of ['wpisz krócej w pole numer', 'kliknij dokładniej', 'czy możesz mówić krócej i kliknąć Znajdź', 'krócej niż wczoraj', 'dokładniej opisz stronę', 'bardzo krócej']) assert.equal(parseConversationCommand(text), null, text);
});
test('moving through the levels takes one step and saturates at both ends', () => {
  assert.deepEqual(VERBOSITY_LEVELS, ['concise', 'standard', 'detailed']);
  assert.equal(moveVerbosity('standard', 'shorter'), 'concise'); assert.equal(moveVerbosity('standard', 'longer'), 'detailed');
  assert.equal(moveVerbosity('concise', 'shorter'), 'concise'); assert.equal(moveVerbosity('detailed', 'longer'), 'detailed');
  assert.equal(moveVerbosity('concise', 'longer'), 'standard'); assert.equal(moveVerbosity('detailed', 'shorter'), 'standard');
});
test('only the exact three values are accepted from storage, everything else is the default', () => {
  for (const v of VERBOSITY_LEVELS) assert.equal(decodeVerbosity(v), v);
  for (const bad of [undefined, null, 1, true, '', 'Concise', 'verbose', ['concise'], { v: 'concise' }]) assert.equal(decodeVerbosity(bad), DEFAULT_VERBOSITY);
  assert.equal(decodeStoredVerbosity({ verbosity: 'detailed' }, 'verbosity'), 'detailed');
  for (const bad of [undefined, null, 'x', [], {}, { other: 'detailed' }, { verbosity: 'x' }]) assert.equal(decodeStoredVerbosity(bad, 'verbosity'), DEFAULT_VERBOSITY);
  assert.equal(DEFAULT_VERBOSITY, 'standard');
});
test('scroll aliases are exact complete phrases for down, up and top', () => {
  const cases: [string, string][] = [['przewiń', 'down'], ['Przewiń w dół.', 'down'], ['przewiń stronę niżej', 'down'], ['w dół', 'down'], ['niżej!', 'down'], ['przewiń w górę', 'up'], ['Przewiń stronę w górę', 'up'], ['wyżej', 'up'], ['w górę', 'up'], ['na górę', 'top'], ['Na początek strony.', 'top'], ['przewiń na początek', 'top'], ['wróć na początek', 'top'], ['idź na górę', 'top']];
  for (const [text, direction] of cases) assert.deepEqual(parseConversationCommand(text), { kind: 'scroll', direction }, text);
});
test('a scroll word inside ordinary dictation or another command is never a scroll command', () => {
  for (const text of ['kliknij przewiń w dół', 'wpisz w dół w pole numer', 'przewiń w dół i kliknij Znajdź', 'przewiń w dół proszę bardzo', 'czy możesz przewinąć', 'wpisz na górę', 'przewijaj w dół', 'w dół ulicy', 'na górze strony', 'górę']) assert.equal(parseConversationCommand(text), null, text);
});
test('a scroll request must be exact, typed and bound to turn, tab, document and frame 0', () => {
  const good = { type: 'SCROLL', direction: 'down', turnId: 't', tabId: 7, docId: 'd', frameId: 0 };
  assert.deepEqual(decodeScrollRequest(good), good);
  for (const bad of [null, 'x', {}, { ...good, direction: 'left' }, { ...good, turnId: '' }, { ...good, docId: '' }, { ...good, docId: 5 }, { ...good, tabId: '7' }, { ...good, tabId: 1.5 }, { ...good, frameId: 1 }, { ...good, type: 'EXECUTE' }, { ...good, turnId: 'x'.repeat(65) }]) assert.equal(decodeScrollRequest(bad), null, JSON.stringify(bad));
});
test('a scroll result is accepted only for the document that was asked and with sane measured numbers', () => {
  const good = { ok: true, docId: 'd', outcome: 'moved', before: 0, after: 480, max: 2400 };
  assert.deepEqual(decodeScrollResult(good, 'd'), good);
  assert.deepEqual(decodeScrollResult({ ok: false, reason: 'stale' }, 'd'), { ok: false, reason: 'stale' });
  for (const bad of [null, 'x', {}, { ...good, docId: 'other' }, { ...good, outcome: 'scrolled' }, { ...good, after: -1 }, { ...good, after: NaN }, { ...good, max: Infinity }, { ...good, before: '0' }, { ok: false, reason: 'boom' }, { ok: 'true' }]) assert.equal(decodeScrollResult(bad, 'd'), null, JSON.stringify(bad));
});
