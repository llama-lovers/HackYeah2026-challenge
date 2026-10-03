import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const s: any = existsSync(new URL('./pending.ts', import.meta.url)) ? await import('./pending.ts') : {};
const pending = { kind: 'confirm_parcel', id: 'p', tabId: 7, digits: '12345678', createdAt: 100, reprompts: 0 };
test('choice reply is zero-based with one reprompt cancellation and expiry first', () => {
  const p = {...pending, kind:'choose_option', options:[{},{},{}]};
  assert.deepEqual(s.routeReply(p,'dwa',1100),{kind:'choose',index:1});
  for(const text of ['cztery','cokolwiek','tak']) {
    assert.deepEqual(s.routeReply(p,text,1100),{kind:'reprompt'});
    assert.deepEqual(s.routeReply({...p,reprompts:1},text,1100),{kind:'cancel'});
  }
  assert.deepEqual(s.routeReply(p,'nie',1100),{kind:'cancel'});
  assert.deepEqual(s.routeReply(p,'dwa',60101),{kind:'expired'});
});
test('pending confirmation expires strictly after the TTL and bounds reprompts', () => {
  assert.deepEqual(s.routeReply?.(pending, 'tak', 1100), { kind: 'confirm' });
  assert.deepEqual(s.routeReply(pending, 'nie', 1100), { kind: 'cancel' });
  assert.deepEqual(s.routeReply(pending, 'co innego', 1100), { kind: 'reprompt' });
  assert.deepEqual(s.routeReply({ ...pending, reprompts: 1 }, 'co innego', 1100), { kind: 'cancel' });
  assert.deepEqual(s.routeReply(pending, 'sprawdź status przesyłki 12345678', 1100), { kind: 'restart' });
  assert.deepEqual(s.routeReply(pending, 'tak', 60100), { kind: 'confirm' });
  assert.deepEqual(s.routeReply(pending, 'tak', 60101), { kind: 'expired' });
});
test('await number routes valid digits and bounds malformed replies', () => {
  const p = { ...pending, kind: 'await_parcel_number' };
  assert.deepEqual(s.routeReply(p, '1234 5678', 1100), { kind: 'number', digits: '12345678' });
  assert.deepEqual(s.routeReply(p, '1234567', 1100), { kind: 'bad_number', count: 7 });
  assert.deepEqual(s.routeReply(p, 'banan', 1100), { kind: 'bad_number', count: null });
  assert.deepEqual(s.routeReply({ ...p, reprompts: 1 }, '1234567', 1100), { kind: 'cancel' });
  assert.deepEqual(s.routeReply(p, 'anuluj', 1100), { kind: 'cancel' });
  assert.deepEqual(s.routeReply(p, '12345678', 60100), { kind: 'number', digits: '12345678' });
  assert.deepEqual(s.routeReply(p, '12345678', 60101), { kind: 'expired' });
});
test('action confirmation never restarts for a new parcel command', () => {
  const p = { ...pending, kind: 'confirm_action' };
  assert.deepEqual(s.routeReply(p, 'tak', 1100), { kind: 'confirm' });
  assert.deepEqual(s.routeReply(p, 'nie', 1100), { kind: 'cancel' });
  assert.deepEqual(s.routeReply(p, 'sprawdź status przesyłki 12345678', 1100), { kind: 'reprompt' });
});
test('action replies use whole utterance matching and preserve the TTL boundary', () => {
  const p = { ...pending, kind: 'confirm_action' };
  assert.deepEqual(s.routeReply(p, 'anuluj', 1100), { kind: 'cancel' });
  for (const text of ['tak albo nie', 'tak proszę', 'cokolwiek', 'Potwierdzasz? Powiedz tak albo nie.']) {
    assert.deepEqual(s.routeReply(p, text, 1100), { kind: 'reprompt' });
    assert.deepEqual(s.routeReply({ ...p, reprompts: 1 }, text, 1100), { kind: 'cancel' });
  }
  assert.deepEqual(s.routeReply(p, 'tak', 60100), { kind: 'confirm' });
  assert.deepEqual(s.routeReply(p, 'tak', 60101), { kind: 'expired' });
});
