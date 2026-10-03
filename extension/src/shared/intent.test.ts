import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const s: any = existsSync(new URL('./intent.ts', import.meta.url)) ? await import('./intent.ts') : {};
test('tracking intent is anchored and retains the number', () => {
  for (const text of ['Sprawdź status przesyłki numer 12345678.', 'status paczki 12345678', 'śledź przesyłkę 12345678']) assert.deepEqual(s.parseIntent?.(text), { kind: 'track_parcel', rest: '12345678' });
  assert.deepEqual(s.parseIntent('sprawdź status przesyłki'), { kind: 'track_parcel', rest: '' });
  for (const text of ['wpisz 873234987612340872938732 w pole numeru przesyłki', 'kliknij Znajdź', 'pokaż paczkomaty', 'kliknij paczki']) assert.deepEqual(s.parseIntent(text), { kind: 'other' });
});
test('confirmation matches only a complete utterance', () => {
  for (const text of ['Tak.', 'TAK!', 'tak jest', 'potwierdzam']) assert.deepEqual(s.parseIntent?.(text), { kind: 'yes' });
  for (const text of ['Nie.', 'anuluj']) assert.deepEqual(s.parseIntent(text), { kind: 'no' });
  for (const text of ['powiedz tak albo nie', 'tak, kliknij Zapłać']) assert.deepEqual(s.parseIntent(text), { kind: 'other' });
});
