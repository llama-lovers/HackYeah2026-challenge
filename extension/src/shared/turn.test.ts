import test from 'node:test';
import assert from 'node:assert/strict';
import { onToggle, isStale } from './turn.ts';
test('toggle starts recording from undefined and idle', () => {
  const expected = { next: { phase: 'recording', tabId: 7, startedAt: 100, id: 't1' }, effect: 'start' };
  assert.deepEqual(onToggle(undefined, 7, 100, 't1'), expected);
  assert.deepEqual(onToggle({ phase: 'idle', startedAt: 0 }, 7, 100, 't1'), expected);
});
test('toggle stops recording and preserves busy processing state', () => {
  const recording = { phase: 'recording', tabId: 7, startedAt: 100, stubText: 'x' } as const;
  const stop = onToggle(recording, 8, 200);
  assert.equal(stop.effect, 'stop');
  assert.deepEqual(stop.next, { ...recording, phase: 'processing' });
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
