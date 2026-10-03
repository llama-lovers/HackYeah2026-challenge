import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeProposal, decodeEffect, decodeTranscriptBody, isFromOffscreen, sttCodeForStatus, MAX_TRANSCRIPT_CHARS, STT_ERROR_CODES } from './protocol.ts';
const valid = { action: 'click', target: 'e1', text: '', needs_confirmation: false, say: 'Klikam.' };
test('a well-formed proposal decodes and unknown extra keys are dropped', () => {
  assert.deepEqual(decodeProposal({ ...valid, option_1: 'e1', option_2: 'e2', option_3: '', extra: 'x' }), { ...valid, option_1: 'e1', option_2: 'e2', option_3: '' });
  assert.deepEqual(decodeProposal({ ...valid, action: 'none', target: '' }), { ...valid, action: 'none', target: '' });
  assert.deepEqual(decodeProposal({ ...valid, action: 'fill', text: '12345678' }), { ...valid, action: 'fill', text: '12345678' });
  assert.equal(decodeProposal({ ...valid, action: 'choose', target: '' })?.action, 'choose');
});
test('empty, malformed and wrongly typed proposals never decode (nothing may reach the page)', () => {
  const bad: unknown[] = [undefined, null, 42, 'click e1', [], {}, { action: 'click' },
    { ...valid, action: 'teleport' }, { ...valid, action: 7 }, { ...valid, target: 5 }, { ...valid, target: '' },
    { ...valid, target: 'e'.repeat(65) }, { ...valid, text: 5 }, { ...valid, text: 'x'.repeat(501) }, { ...valid, needs_confirmation: 'false' }, { ...valid, needs_confirmation: undefined },
    { ...valid, say: null }, { ...valid, say: 'x'.repeat(1001) }, { ...valid, option_1: 3 }, { ...valid, option_2: 'x'.repeat(65) }];
  for (const body of bad) assert.equal(decodeProposal(body), null, JSON.stringify(body));
});
test('effect and transcript bodies are decoded with bounds', () => {
  assert.equal(decodeEffect({ say: 'Gotowe.' }), 'Gotowe.');
  for (const body of [null, {}, [], { say: 42 }, { say: 'x'.repeat(1001) }, 'Gotowe.']) assert.equal(decodeEffect(body), null);
  assert.equal(decodeTranscriptBody({ text: 'kliknij Znajdź' }), 'kliknij Znajdź');
  assert.equal(decodeTranscriptBody({ text: '' }), '', 'silence is an empty transcript, not a fault');
  for (const body of [null, {}, [], { text: 42 }, { text: null }, { text: 'x'.repeat(MAX_TRANSCRIPT_CHARS + 1) }, 'text']) assert.equal(decodeTranscriptBody(body), null);
});
test('offscreen events accept only typed codes and bounded transcripts', () => {
  const event = (body: object) => ({ target: 'sw', turnId: 't', ...body });
  for (const code of STT_ERROR_CODES) assert.equal(isFromOffscreen(event({ type: 'TRANSCRIBE_ERROR', code })), true, code);
  for (const code of ['not_allowed', 'no_device', 'other']) assert.equal(isFromOffscreen(event({ type: 'MIC_ERROR', code })), true);
  for (const body of [{ type: 'TRANSCRIBE_ERROR', code: 'CANARY raw provider text' }, { type: 'TRANSCRIBE_ERROR' }, { type: 'MIC_ERROR', code: 'x' }, { type: 'TRANSCRIPT', text: 5 }, { type: 'TRANSCRIPT', text: 'x'.repeat(MAX_TRANSCRIPT_CHARS + 1) }, { type: 'NOPE' }])
    assert.equal(isFromOffscreen(event(body)), false, JSON.stringify(body));
  assert.equal(isFromOffscreen({ target: 'sw', type: 'REC_STOPPED' }), false);
});
test('transcription status maps to a typed category and the body is never consulted', () => {
  const table: [number, string][] = [[504, 'stt_timeout'], [503, 'not_configured'], [502, 'stt_failed'], [500, 'stt_failed'], [400, 'stt_failed'], [413, 'stt_failed'], [415, 'stt_failed'], [422, 'stt_failed'], [403, 'network'], [404, 'network'], [429, 'network'], [0, 'network']];
  for (const [status, code] of table) assert.equal(sttCodeForStatus(status), code, String(status));
});
