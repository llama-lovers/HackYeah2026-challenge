import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeOutputMode, decodeOutputRecovery } from './settings.ts';
test('only an explicit browser voice selection enables TTS', () => {
  for (const value of [undefined, null, {}, true, 'tts', 'BROWSER_TTS']) assert.equal(decodeOutputMode(value), 'screen_reader');
  assert.equal(decodeOutputMode('browser_tts'), 'browser_tts');
});
test('recovery decoding accepts fixed codes only', () => {
  assert.equal(decodeOutputRecovery('page_access'), 'page_access');
  assert.equal(decodeOutputRecovery('Untrusted page text'), undefined);
});
