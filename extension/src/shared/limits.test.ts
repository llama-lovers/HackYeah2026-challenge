import test from 'node:test';
import assert from 'node:assert/strict';
import * as limits from './limits.ts';
import { STALE_MS } from './turn.ts';
test('recording cap supports dictation without reaching turn staleness', () => {
  assert.equal((limits as any).RECORDING_CAP_MS, 25000);
  assert((limits as any).RECORDING_CAP_MS < STALE_MS);
});
test('step budget permits exactly three actions and never charges reads', () => {
  const l: any = limits;
  assert.equal(l.MAX_STEPS_PER_COMMAND, 3);
  const budget = l.createBudget();
  for (let i = 1; i <= 3; i++) { assert.equal(l.takeStep(budget), true); assert.equal(budget.used, i); }
  assert.equal(l.takeStep(budget), false); assert.equal(budget.used, 3);
  assert.equal(l.takeStep(l.createBudget(0)), false);
});
