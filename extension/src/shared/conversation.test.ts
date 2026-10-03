import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConversationCommand, normalizePhrase, savesForReplay, makeReplay, decodeReplay, decodeAnnounceAck, MAX_REPLAY_CHARS } from './conversation.ts';

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
