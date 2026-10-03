import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots, isEmptyDiff } from './diff.ts';
import type { Snapshot, SnapNode } from './snapshot-format.ts';
const snapshot = (nodes: SnapNode[] = []): Snapshot => ({ epoch: 1, path: '/tracking', title: 'Tracking', nodes, truncated: false });
const control = (name: string, extra: Partial<SnapNode> = {}): SnapNode => ({ kind: 'interactive', role: 'textbox', name, ...extra });
test('identical snapshots have an empty diff', () => {
  const s = snapshot([control('Parcel', { value: '' })]);
  assert.deepEqual(diffSnapshots(s, s), { added: [], removed: [], changed: [], alerts: [] });
  assert.equal(isEmptyDiff(diffSnapshots(s, s)), true);
});
test('changed parcel value is reported from the masked snapshot', () => {
  const d = diffSnapshots(snapshot([control('Parcel', { value: '' })]), snapshot([control('Parcel', { value: '873234987612340872938732' })]));
  assert.deepEqual(d.changed, [{ role: 'textbox', name: 'Parcel', what: 'value', to: '873234987612340872938732' }]);
  assert.equal(isEmptyDiff(d), false);
});
test('enabled disabled checked expanded and invalid flips are reported', () => {
  for (const [before, after, expected] of [[{ disabled: true }, {}, 'enabled'], [{}, { disabled: true }, 'disabled'], [{ checked: false }, { checked: true }, 'checked'], [{ expanded: true }, { expanded: false }, 'expanded'], [{}, { invalid: true }, 'invalid']] as const) {
    const d = diffSnapshots(snapshot([control('Control', { state: before })]), snapshot([control('Control', { state: after })]));
    assert.equal(d.changed[0]?.what, expected);
    assert.equal(isEmptyDiff(d), false);
  }
});
test('new text and alerts and removed headings are distinct', () => {
  const d = diffSnapshots(snapshot([{ kind: 'heading', role: 'heading', name: 'Old heading' }]), snapshot([{ kind: 'text', role: 'text', name: 'Status: W drodze do paczkomatu' }, { kind: 'alert', role: 'status', name: 'Ready' }]));
  assert.deepEqual(d.added, ['Status: W drodze do paczkomatu']);
  assert.deepEqual(d.removed, ['Old heading']);
  assert.deepEqual(d.alerts, ['Ready']);
});
test('path and title transitions are reported', () => {
  const d = diffSnapshots(snapshot(), { ...snapshot(), path: '/search', title: 'Search' });
  assert.deepEqual(d.path, { before: '/tracking', after: '/search' });
  assert.deepEqual(d.title, { before: 'Tracking', after: 'Search' });
  assert.equal(isEmptyDiff(d), false);
});
test('duplicate controls match by ordinal independently of ids', () => {
  const first = control('Usuń', { role: 'button', id: 'e1' });
  const d = diffSnapshots(snapshot([first, { ...first, id: 'e2' }]), snapshot([{ ...first, id: 'e9' }]));
  assert.deepEqual(d.removed, ['button Usuń']);
  assert.deepEqual(d.added, []);
});
test('collapsed text is compared as a multiset', () => {
  const n: SnapNode = { kind: 'text', role: 'text', name: ' OK ' };
  assert.deepEqual(diffSnapshots(snapshot([n]), snapshot([n, { ...n, name: 'OK' }])).added, ['OK']);
});
test('caps added removed changed alerts and every string by code point', () => {
  const texts = Array.from({ length: 20 }, (_, i): SnapNode => ({ kind: 'text', role: 'text', name: i + '😀'.repeat(200) }));
  const alerts = Array.from({ length: 10 }, (_, i): SnapNode => ({ kind: 'alert', role: 'alert', name: 'alert ' + i }));
  const d = diffSnapshots(snapshot(), snapshot([...texts, ...alerts]));
  assert.equal(d.added.length, 8); assert.equal(d.alerts.length, 3);
  assert(d.added.every(s => Array.from(s).length <= 160));
  assert.equal(diffSnapshots(snapshot(texts), snapshot()).removed.length, 5);
  const controls = Array.from({ length: 10 }, (_, i) => control(String(i), { value: '' }));
  const changes = diffSnapshots(snapshot(controls), snapshot(controls.map(n => ({ ...n, value: '😀'.repeat(200) })))).changed;
  assert.equal(changes.length, 8); assert(changes.every(n => Array.from(n.to!).length <= 160));
});
