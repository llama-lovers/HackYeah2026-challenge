import test from 'node:test';
import assert from 'node:assert/strict';
import { onToggle, isStale, toProcessing, waitDecision, WAIT_NOTICE_MS } from './turn.ts';
test('toggle starts recording from undefined and idle', () => {
  const expected = { next: { phase: 'recording', tabId: 7, startedAt: 100, id: 't1' }, effect: 'start' };
  assert.deepEqual(onToggle(undefined, 7, 100, 't1'), expected);
  assert.deepEqual(onToggle({ phase: 'idle', startedAt: 0 }, 7, 100, 't1'), expected);
});
test('toggle stops recording and preserves busy processing state', () => {
  const recording = { phase: 'recording', tabId: 7, startedAt: 100, stubText: 'x' } as const;
  const stop = onToggle(recording, 8, 200);
  assert.equal(stop.effect, 'stop');
  assert.deepEqual(stop.next, { ...recording, phase: 'processing', startedAt: 200, processingDeadline: 200 + WAIT_NOTICE_MS });
  const busy = onToggle(stop.next, 8, 300);
  assert.equal(busy.effect, 'busy');
  assert.equal(busy.next, stop.next);
});
test('stale reset occurs at 30001 ms, never at 30000 ms', () => {
  for (const phase of ['recording', 'processing'] as const) {
    const state = { phase, startedAt: 0, tabId: 7 };
    assert.equal(isStale(state, 30000), false);
    assert.equal(isStale(state, 30001), true);
    assert.equal(onToggle(state, 8, 30000).effect, phase === 'recording' ? 'stop' : 'busy');
    assert.deepEqual(onToggle(state, 8, 30001, 't2'), { next: { phase: 'recording', tabId: 8, startedAt: 30001, id: 't2' }, effect: 'start' });
  }
  assert.equal(isStale({ phase: 'idle', startedAt: 0 }, 99999), false);
});
test('the wait deadline is set once when recording stops and a repeated transition never pushes it out', () => {
  assert.equal(WAIT_NOTICE_MS, 8000);
  const first = toProcessing({ phase: 'recording', tabId: 7, startedAt: 0, id: 'a' }, 1000);
  assert.equal(first.processingDeadline, 9000);
  assert.equal(toProcessing(first, 5000).processingDeadline, 9000);
  assert.equal(onToggle(first, 7, 5000).effect, 'busy');
});
test('the wait notice is due only for the owning, processing, unnotified turn with no answer claimed', () => {
  const base = { phase: 'processing', tabId: 7, startedAt: 1000, id: 'a', processingDeadline: 9000 } as const;
  assert.deepEqual(waitDecision(base, 'a', 1000), { kind: 'wait', ms: 8000 });
  assert.deepEqual(waitDecision(base, 'a', 8999), { kind: 'wait', ms: 1 });
  assert.deepEqual(waitDecision(base, 'a', 9000), { kind: 'fire' });
  for (const state of [undefined, { ...base, id: 'b' }, { ...base, phase: 'idle' as const }, { ...base, phase: 'recording' as const }, { ...base, processingDeadline: undefined },
    { ...base, waitNotifiedAt: 9000 }, { ...base, outputClaimed: true }]) assert.deepEqual(waitDecision(state, 'a', 9500), { kind: 'drop' });
  assert.deepEqual(waitDecision(base, 'a', 31001), { kind: 'drop' }, 'an abandoned (stale) turn never gets a late notice');
});
