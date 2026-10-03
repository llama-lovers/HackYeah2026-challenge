import test from 'node:test';
import assert from 'node:assert/strict';
import { collapse, truncate, stripQuery, spokenName, toModelText } from './snapshot-format.ts';
import type { Snapshot } from './snapshot-format.ts';

test('renders exact model grammar, states and quote encoding', () => {
  const s: Snapshot = { epoch: 1, path: '/tracking', title: '  Tytuł strony ', truncated: true, nodes: [
    { kind: 'heading', role: 'heading', name: 'Śledź "paczkę"' },
    { kind: 'interactive', role: 'textbox', id: 'e1', name: 'Parcel', hint: 'Wpisz numer', value: '12345678', state: { required: true, invalid: true, sensitive: true } },
    { kind: 'interactive', role: 'button', id: 'e2', name: 'Dalej', state: { disabled: true } },
    { kind: 'interactive', role: 'link', id: 'e3', name: 'Szukaj', href: '/search' },
    { kind: 'interactive', role: 'checkbox', id: 'e4', name: 'Opcja', hint: 'Opcja', state: { checked: false, expanded: false } },
    { kind: 'alert', role: 'alert', name: ' Uwaga\n na dane ' },
  ] };
  assert.equal(toModelText(s), `path: /tracking\ntitle: Tytuł strony\nheading "Śledź 'paczkę'"\ntextbox e1 "Parcel" placeholder="Wpisz numer" value="12345678" required invalid sensitive\nbutton e2 "Dalej" disabled\nlink e3 "Szukaj" href=/search\ncheckbox e4 "Opcja" unchecked collapsed\nalert "Uwaga na dane"\n[snapshot truncated]`);
});
test('empty snapshots render exactly path and title', () => {
  assert.equal(toModelText({ epoch: 0, path: '/', title: '', nodes: [], truncated: false }), 'path: /\ntitle: ');
});
test('collapses whitespace and truncates by code point', () => {
  assert.equal(collapse(' a\n\t b '), 'a b');
  const cut = truncate('ź'.repeat(130), 120);
  assert.equal(Array.from(cut).length, 120);
  assert.ok(cut.endsWith('…'));
  assert.equal(truncate('😀'.repeat(130), 120), '😀'.repeat(119) + '…');
  assert.equal(truncate('abc', 0), '');
});
test('spoken names prefer nonempty hints and URLs omit query and fragment', () => {
  assert.equal(spokenName({ kind: 'interactive', role: 'textbox', name: 'English', hint: ' Polski ' }), 'Polski');
  assert.equal(spokenName({ kind: 'interactive', role: 'textbox', name: 'English', hint: ' ' }), 'English');
  assert.equal(stripQuery('https://inpost.pl/tracking?number=123#x'), '/tracking');
  assert.equal(stripQuery('/tracking?number=123#x'), '/tracking');
});
