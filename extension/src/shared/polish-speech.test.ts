import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const s: any = existsSync(new URL('./polish-speech.ts', import.meta.url)) ? await import('./polish-speech.ts') : {};
export const digits = '873234987612340872938732';
test('parcel readback speaks individual digits in groups of four', () => {
  assert.equal(s.digitsToSpokenGroups?.(digits), 'osiem siedem trzy dwa, trzy cztery dziewięć osiem, siedem sześć jeden dwa, trzy cztery zero osiem, siedem dwa dziewięć trzy, osiem siedem trzy dwa');
  assert.equal(s.digitsToSpokenGroups('12345678'), 'jeden dwa trzy cztery, pięć sześć siedem osiem');
});
test('dictation preserves digits and rejects unknown words', () => {
  for (const [text, expected] of [['8732 3498 7612 3408 7293 8732', digits], ['8732-3498', '87323498'], ['osiem siedem trzy dwa', '8732'], ['numer zero zero jeden', '001'], ['000000000000000000000001', '000000000000000000000001']]) assert.deepEqual(s.wordsToDigits?.(text), { ok: true, digits: expected });
  assert.deepEqual(s.wordsToDigits('osiem banan'), { ok: false });
});
