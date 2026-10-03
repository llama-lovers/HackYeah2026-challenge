import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProposal } from './validate.ts';
import type { Proposal, ResolvedTarget, RejectReason } from './validate.ts';
const proposal: Proposal = { action: 'click', target: 'e1', text: '', needs_confirmation: false, say: '' };
const target: ResolvedTarget = { exists: true, epochMatches: true, connected: true, visible: true, disabled: false, role: 'button', sensitive: false, name: 'Znajdź', maxLength: null, submitsNonLookupForm: false, sideEffectSignals: false, knownSafe: true };
const cases: [RejectReason, Partial<Proposal>, Partial<ResolvedTarget> | null][] = [
  ['unknown_action', { action: 'navigate' }, {}], ['not_found', {}, null],
  ['not_found', {}, { exists: false }], ['stale', {}, { epochMatches: false }],
  ['not_found', {}, { connected: false }], ['hidden', {}, { visible: false }],
  ['disabled', {}, { disabled: true }], ['role_mismatch', {}, { role: 'textbox' }],
  ['role_mismatch', { action: 'fill', text: 'abc' }, {}],
  ['sensitive_fill', { action: 'fill', text: 'secret' }, { role: 'textbox', sensitive: true }],
  ['empty_text', { action: 'fill', text: '   ' }, { role: 'textbox' }],
  ['empty_text', { action: 'fill', text: '' }, { role: 'textbox' }],
  ['too_long', { action: 'fill', text: '1234567890' }, { role: 'textbox', maxLength: 8 }],
  ['too_long', { action: 'fill', text: '😀😀' }, { role: 'textbox', maxLength: 3 }],
  ['needs_confirmation', { needs_confirmation: true }, {}],
  ['irreversible', {}, { submitsNonLookupForm: true }],
];
for (const [reason, p, t] of cases) test(`rejects ${reason}: ${JSON.stringify([p, t])}`, () => {
  assert.deepEqual(validateProposal({ ...proposal, ...p }, t === null ? null : { ...target, ...t }), { ok: false, reason });
});
for (const name of ['Zapłać', 'Kup teraz', 'Zamów', 'Usuń konto', 'Wyślij formularz', 'Zatwierdź', 'Akceptuję wszystkie', 'Zgadzam się', 'Pay now', 'Delete', 'Accept all', 'zaplac', 'płać', 'kupuję', 'zamawiam', 'usun', 'wyslij', 'akceptuj', 'potwierdzam', 'subskrybuj', 'zapisz się', 'buy', 'order now', 'remove', 'send', 'submit', 'agree', 'subscribe']) test(`rejects irreversible name ${name}`, () => {
  assert.deepEqual(validateProposal(proposal, { ...target, name }), { ok: false, reason: 'irreversible' });
});
for (const name of ['Znajdź', 'Szukaj', 'Pokaż mapę', 'Moje zamówienia', 'Kupony', 'Dodaj kolejny numer przesyłki', 'Dalej']) test(`permits lookup name ${name}`, () => {
  for (const role of ['button', 'link']) assert.deepEqual(validateProposal(proposal, { ...target, role, name }), { ok: true, kind: 'click' });
});
test('permits a precise 24-digit parcel fill and none without a target', () => {
  assert.deepEqual(validateProposal({ ...proposal, action: 'fill', text: '873234987612340872938732' }, { ...target, role: 'textbox', maxLength: 24 }), { ok: true, kind: 'fill' });
  assert.deepEqual(validateProposal({ ...proposal, action: 'none', target: '' }, null), { ok: true, kind: 'none' });
});
for (const name of ['Potwierdź płatność', 'Zapisz zmiany', 'Wyrażam zgodę na regulamin', 'Potwierdź zakup']) test(`rejects Polish side effect ${name}`, () => {
  assert.deepEqual(validateProposal(proposal, { ...target, name }), { ok: false, reason: 'irreversible' });
});
test('rejects hidden side-effect signals reported by the content script', () => {
  assert.deepEqual(validateProposal(proposal, { ...target, name: 'Dalej', sideEffectSignals: true }), { ok: false, reason: 'irreversible' });
});
test('refuses clicks without a positive safe classification (CR-03)', () => {
  assert.deepEqual(validateProposal(proposal, { ...target, name: 'Dalej', knownSafe: false }), { ok: false, reason: 'irreversible' });
});
