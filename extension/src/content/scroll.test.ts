import test from 'node:test';
import assert from 'node:assert/strict';
import { scrollDocument, SCROLL_VIEWPORT_FRACTION } from './scroll.ts';
import type { ScrollHost } from './scroll.ts';
// A fake window whose scroll position follows scrollTo like a real one: clamped to the range, optionally ignoring or reversing the request.
function host(opts: { scrollHeight: number; innerHeight?: number; y?: number; mode?: 'normal' | 'ignore' | 'reverse'; stealFocus?: boolean }) {
  const innerHeight = opts.innerHeight ?? 600, max = Math.max(0, opts.scrollHeight - innerHeight);
  const first = { isConnected: true, focus: () => { state.focused = first; focusCalls.push('restore'); } };
  const other = { isConnected: true };
  const focusCalls: string[] = [], calls: any[] = [];
  const state = { y: opts.y ?? 0, focused: first as unknown };
  const win = {
    get scrollY() { return state.y; }, innerHeight,
    scrollTo(arg: any) {
      calls.push(arg);
      if (opts.mode === 'ignore') return;
      state.y = opts.mode === 'reverse' ? Math.min(max, state.y + 50) : Math.min(max, Math.max(0, arg.top));
      if (opts.stealFocus) state.focused = other;
    },
    document: { scrollingElement: { scrollHeight: opts.scrollHeight }, documentElement: { scrollHeight: opts.scrollHeight }, get activeElement() { return state.focused; } },
  };
  return { win: win as unknown as ScrollHost, state, calls, focusCalls, first, other };
}
const owner = { docId: 'doc-1', currentDocId: () => 'doc-1' };
test('down moves about eighty percent of the viewport immediately and reports the measured positions', () => {
  const h = host({ scrollHeight: 3000 });
  const r = scrollDocument('down', owner, h.win);
  assert.deepEqual(r, { ok: true, docId: 'doc-1', outcome: 'moved', before: 0, after: 480, max: 2400 });
  assert.equal(SCROLL_VIEWPORT_FRACTION, 0.8);
  assert.deepEqual(h.calls, [{ top: 480, behavior: 'instant' }]);
});
test('down and up are clamped at the document ends and top returns to zero', () => {
  let h = host({ scrollHeight: 3000, y: 2300 });
  assert.deepEqual(scrollDocument('down', owner, h.win), { ok: true, docId: 'doc-1', outcome: 'moved', before: 2300, after: 2400, max: 2400 });
  h = host({ scrollHeight: 3000, y: 200 });
  assert.deepEqual(scrollDocument('up', owner, h.win), { ok: true, docId: 'doc-1', outcome: 'moved', before: 200, after: 0, max: 2400 });
  h = host({ scrollHeight: 3000, y: 1700 });
  assert.deepEqual(scrollDocument('top', owner, h.win), { ok: true, docId: 'doc-1', outcome: 'moved', before: 1700, after: 0, max: 2400 });
});
test('a boundary is reported as a boundary, never as movement', () => {
  for (const [direction, y] of [['down', 2400], ['up', 0], ['top', 0]] as const) {
    const r = scrollDocument(direction, owner, host({ scrollHeight: 3000, y }).win);
    assert.equal(r.ok && r.outcome, 'boundary', direction);
    assert(r.ok && r.before === y && r.after === y);
  }
  // One pixel short of the end is the end: a one-pixel nudge is not announced as a movement.
  assert.deepEqual(scrollDocument('down', owner, host({ scrollHeight: 3000, y: 2399 }).win), { ok: true, docId: 'doc-1', outcome: 'boundary', before: 2399, after: 2400, max: 2400 });
  // Two pixels short still moves, and the speech says the end was reached.
  assert.deepEqual(scrollDocument('down', owner, host({ scrollHeight: 3000, y: 2398 }).win), { ok: true, docId: 'doc-1', outcome: 'moved', before: 2398, after: 2400, max: 2400 });
});
test('a page that cannot scroll, ignores the request or fights it is unsupported', () => {
  const short = host({ scrollHeight: 600 });
  assert.equal((scrollDocument('down', owner, short.win) as any).outcome, 'unsupported'); assert.deepEqual(short.calls, [], 'nothing to scroll, nothing attempted');
  assert.equal((scrollDocument('down', owner, host({ scrollHeight: 3000, mode: 'ignore' }).win) as any).outcome, 'unsupported');
  assert.equal((scrollDocument('up', owner, host({ scrollHeight: 3000, y: 500, mode: 'ignore' }).win) as any).outcome, 'unsupported');
  assert.equal((scrollDocument('up', owner, host({ scrollHeight: 3000, y: 500, mode: 'reverse' }).win) as any).outcome, 'unsupported');
});
test('focus is never moved, and restored if a page script moved it', () => {
  const calm = host({ scrollHeight: 3000 });
  scrollDocument('down', owner, calm.win);
  assert.equal(calm.state.focused, calm.first); assert.deepEqual(calm.focusCalls, []);
  const hijacked = host({ scrollHeight: 3000, stealFocus: true });
  scrollDocument('down', owner, hijacked.win);
  assert.equal(hijacked.state.focused, hijacked.first); assert.deepEqual(hijacked.focusCalls, ['restore']);
});
test('a request for another document is stale and does nothing', () => {
  const h = host({ scrollHeight: 3000 });
  assert.deepEqual(scrollDocument('down', { docId: 'doc-1', currentDocId: () => 'doc-2' }, h.win), { ok: false, reason: 'stale' });
  assert.deepEqual(h.calls, []);
});
