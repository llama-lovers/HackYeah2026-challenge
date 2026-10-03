import test from 'node:test';
import assert from 'node:assert/strict';
import * as limits from './limits.ts';
import { STALE_MS } from './turn.ts';
test('recording cap supports dictation without reaching turn staleness', () => {
  assert.equal((limits as any).RECORDING_CAP_MS, 25000);
  assert((limits as any).RECORDING_CAP_MS < STALE_MS);
});
