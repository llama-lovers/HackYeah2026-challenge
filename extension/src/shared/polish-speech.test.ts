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
export const hundreds = 'osiemset siedemdziesiąt trzy dwieście trzydzieści cztery dziewięćset osiemdziesiąt siedem sześćset dwanaście trzysta czterdzieści osiemset siedemdziesiąt dwa dziewięćset trzydzieści osiem siedemset trzydzieści dwa';
test('Polish chunks normalize every supported ASR rendering without guessing', () => {
  const words = 'osiem siedem trzy dwa trzy cztery dziewięć osiem siedem sześć jeden dwa trzy cztery zero osiem siedem dwa dziewięć trzy osiem siedem trzy dwa';
  for (const text of [words, hundreds, '873 234 987 612 340 872 938 732', '8732 3498 7612 3408 7293 8732']) assert.deepEqual(s.wordsToDigits(text), { ok: true, digits });
  for (const [text, result] of [['dwanaście trzydzieści cztery pięćdziesiąt sześć siedemdziesiąt osiem', '12345678'], ['sto pięć', '105'], ['sto', '100'], ['dwadzieścia', '20'], ['dwadzieścia trzy', '23'], ['zero pięć', '05']]) assert.deepEqual(s.wordsToDigits(text), { ok: true, digits: result });
  for (const text of ['dwa tysiące', 'osiem banan']) assert.deepEqual(s.wordsToDigits(text), { ok: false });
});
test('cardinals and plural forms follow Polish agreement', () => {
  for (const [n, result] of [[0, 'zero'], [7, 'siedem'], [23, 'dwadzieścia trzy'], [105, 'sto pięć'], [999, 'dziewięćset dziewięćdziesiąt dziewięć'], [1000, 'tysiąc'], [2000000, 'dwa miliony']]) assert.equal(s.spellInteger?.(n), result);
  for (const n of [1, 2, 3, 4, 22, 23, 24, 102, 0, 5, 11, 12, 14, 21, 25, 112, 113, 114]) assert.equal(s.pluralForm(n, 'one', 'few', 'many'), n === 1 ? 'one' : [2, 3, 4, 22, 23, 24, 102].includes(n) ? 'few' : 'many');
});
