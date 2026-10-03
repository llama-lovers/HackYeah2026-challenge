import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
const s: any = existsSync(new URL('./intent.ts', import.meta.url)) ? await import('./intent.ts') : {};
test('secret requests and assignments refuse without classifying ordinary questions as secrets', () => {
  for(const text of ['wpisz moje hasło Tajne123','podaj kod BLIK 123456','wprowadź kod z SMS-a 731904','wpisz kod jednorazowy','wpisz PIN 1234','wpisz numer karty 4111 1111 1111 1111','wpisz PESEL','hasło to Tajne123','PIN jest 1234','wklej CVV 123','użyj token abc','wpisz kod weryfikacyjny 1234','wpisz kod odbioru 1234']) assert.deepEqual(s.parseIntent(text),{kind:'secret_request'},text);
  for(const text of ['gdzie jest pole hasła','co to jest captcha','wpisz 1234 w pole numer','kliknij Zapłać']) assert.deepEqual(s.parseIntent(text),{kind:'other'},text);
  assert.deepEqual(s.parseIntent('sprawdź status przesyłki numer 12345678'),{kind:'track_parcel',rest:'12345678'});
});
test('captcha action requests and captcha-labelled targets are recognised after folding', () => {
  for(const text of ['rozwiąż captcha','zaznacz, że nie jestem robotem','kliknij nie jestem robotem','przejdź przez reCAPTCHA','rozwiąż kapczę']) assert.deepEqual(s.parseIntent(text),{kind:'captcha_request'},text);
  for(const label of ['Nie jestem robotem','reCAPTCHA','not a robot','kapcza']) assert.equal(s.isCaptchaLabel?.(label),true,label);
  assert.equal(s.isCaptchaLabel('Znajdź'),false);
});
test('secret content stays local across Polish changes, SMS descriptions and assignments', () => {
  for (const text of ['czy możesz wpisać hasło Sekret', 'czy możesz wprowadzić hasło Tajne', 'ustaw hasło Tajne123', 'zmień PIN na 1234', 'wpisz kod z wiadomości SMS 731904', 'hasło: Tajne123', 'hasło abcdef', 'mój PIN 1234', 'oto kod z otrzymanej wiadomości SMS: 731904', 'czy hasło Tajne123 jest poprawne']) assert.deepEqual(s.parseIntent(text), {kind:'secret_request'}, text);
  for (const text of ['gdzie jest pole hasła', 'gdzie zmienić hasło', 'jak ustawić PIN', 'kliknij Zmień hasło', 'otwórz ustawienia hasła', 'co to jest kod z wiadomości SMS']) assert.deepEqual(s.parseIntent(text), {kind:'other'}, text);
});
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
