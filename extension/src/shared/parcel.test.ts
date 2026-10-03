import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const s: any = existsSync(new URL('./parcel.ts', import.meta.url)) ? await import('./parcel.ts') : {};
test('only eight or twenty-four digit strings are parcel numbers', () => {
  for (const n of [7, 8, 9, 23, 24, 25]) assert.equal(s.isParcelDigits?.('0'.repeat(n)), n === 8 || n === 24);
  assert.equal(s.isParcelDigits('abcdefgh'), false);
});
test('parcel selectors prefer safe field and the Find button over Search link', () => {
  const field = { kind: 'interactive', id: 'e1', role: 'textbox', name: 'Enter parcel numbers separated by commas', hint: 'Wpisz numer przesyłki' };
  const button = { kind: 'interactive', id: 'e3', role: 'button', name: 'Znajdź' };
  const snap = { epoch: 1, path: '/', title: '', truncated: false, nodes: [field, { kind: 'interactive', role: 'link', name: 'Szukaj' }, button] };
  assert.deepEqual(s.pickParcelField?.(snap), field);
  assert.deepEqual(s.pickSearchButton(snap), button);
  assert.equal(s.pickParcelField({ ...snap, nodes: [] }), null);
  assert.equal(s.pickSearchButton({ ...snap, nodes: [] }), null);
  assert.equal(s.pickParcelField({ ...snap, nodes: [{ ...field, state: { sensitive: true } }] }), null);
});
