import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const s: any = existsSync(new URL('./pending.ts', import.meta.url)) ? await import('./pending.ts') : {};
const pending = { kind: 'confirm_parcel', id: 'p', tabId: 7, digits: '12345678', createdAt: 100, reprompts: 0 };
test('pending confirmation expires strictly after the TTL and bounds reprompts', () => {
  assert.deepEqual(s.routeReply?.(pending, 'tak', 1100), { kind: 'confirm' });
  assert.deepEqual(s.routeReply(pending, 'nie', 1100), { kind: 'cancel' });
  assert.deepEqual(s.routeReply(pending, 'co innego', 1100), { kind: 'reprompt' });
  assert.deepEqual(s.routeReply({ ...pending, reprompts: 1 }, 'co innego', 1100), { kind: 'cancel' });
  assert.deepEqual(s.routeReply(pending, 'sprawdź status przesyłki 12345678', 1100), { kind: 'restart' });
  assert.deepEqual(s.routeReply(pending, 'tak', 60100), { kind: 'confirm' });
  assert.deepEqual(s.routeReply(pending, 'tak', 60101), { kind: 'expired' });
});
