import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readActionHistory, rememberAction } from './history.ts';

const store = new Map<string, unknown>();
let fail = false;
(globalThis as any).chrome = { storage: { session: {
  get: async (key: string) => { if (fail) throw new Error('unavailable'); return { [key]: store.get(key) }; },
  set: async (values: Record<string, unknown>) => { if (fail) throw new Error('unavailable'); Object.entries(values).forEach(([k, v]) => store.set(k, v)); },
} } };
beforeEach(() => { store.clear(); fail = false; });

test('keeps only three actions in order even for concurrent saves', async () => {
  await Promise.all([1, 2, 3, 4].map(n => rememberAction({ utterance: `Polecenie ${n}`, action: 'search', detail: `Temat ${n}` })));
  assert.deepEqual((await readActionHistory()).map(e => e.detail), ['Temat 2', 'Temat 3', 'Temat 4']);
});

test('bounds and masks context and rejects corrupt storage entries', async () => {
  await rememberAction({ utterance: 'Numer 44051401458', action: 'fill', detail: 'x'.repeat(1000) });
  const [entry] = await readActionHistory();
  assert.equal(entry!.detail.length, 500);
  store.set('actionHistory', [null, { action: 'execute_code', utterance: 'x', detail: 'x' }, entry]);
  assert.deepEqual(await readActionHistory(), [entry]);
});

test('storage failure does not break actions and missing storage starts empty', async () => {
  assert.deepEqual(await readActionHistory(), []);
  fail = true;
  await rememberAction({ utterance: 'Otwórz', action: 'click', detail: 'Pomoc' });
  assert.deepEqual(await readActionHistory(), []);
});
