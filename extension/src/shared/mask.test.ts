import test from 'node:test';
import assert from 'node:assert/strict';
import { randomInt } from 'node:crypto';
import { maskText, isPesel, isLuhn, isNrb, isSensitiveField } from './mask.ts';

test('masks checksum-valid secrets and preserves parcel numbers', () => {
  const vectors = [
    ['873234987612340872938732', '873234987612340872938732'],
    ['8732 3498 7612 3408 7293 8732', '8732 3498 7612 3408 7293 8732'],
    ['Przesyłka 123456789012345678901234 w drodze', 'Przesyłka 123456789012345678901234 w drodze'],
    ['12345678', '12345678'], ['tel 600 100 200', 'tel 600 100 200'],
    ['PESEL 44051401359', 'PESEL [ukryte]'],
    ['PL61 1090 1014 0000 0712 1981 2874', '[ukryte]'],
    ['61109010140000071219812874', '[ukryte]'],
    ['karta 4111 1111 1111 1111', 'karta [ukryte]'],
    ['4111111111111111', '[ukryte]'],
  ];
  for (const [input, expected] of vectors) assert.equal(maskText(input!), expected);
});
test('never masks 40000 random 24-digit parcel strings, grouped or plain', () => {
  let masked = 0;
  for (let trial = 0; trial < 40000; trial++) {
    const parcel = Array.from({ length: 24 }, () => String(randomInt(10))).join('');
    const grouped = parcel.match(/.{4}/g)!.join(' ');
    if (maskText(parcel) !== parcel || maskText(grouped) !== grouped) masked++;
  }
  assert.equal(masked, 0);
});
test('checksum and length boundaries exclude shorter and longer runs', () => {
  assert.equal(isPesel('44051401359'), true);
  assert.equal(isPesel('44051401358'), false);
  assert.equal(isLuhn('4111111111111111'), true);
  assert.equal(isNrb('61109010140000071219812874'), true);
  for (const n of ['4405140135', '440514013590', '000000000000', '00000000000000000000']) assert.equal(maskText(n), n);
  for (const n of ['badbadbadba', '123']) assert.equal(isPesel(n), false);
  assert.equal(isNrb('61109010140000071219812875'), false);
  assert.equal(maskText('PL611090101400000712198128741'), 'PL611090101400000712198128741');
});
test('field signals mask independently of checksum, without marking lookup fields', () => {
  assert.equal(isSensitiveField({ tag: 'input', type: 'password' }), true);
  for (const autocomplete of ['cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'one-time-code', 'current-password', 'new-password']) assert.equal(isSensitiveField({ tag: 'input', autocomplete: `section-test ${autocomplete}` }), true);
  for (const label of ['Numer PESEL', 'Numer konta (IBAN)', 'Numer karty', 'CVV', 'Kod SMS', 'Kod BLIK', 'Hasło', 'haslo', 'Kod jednorazowy', 'PIN']) assert.equal(isSensitiveField({ tag: 'input', label }), true, label);
  for (const label of ['Numer przesyłki', 'E-mail', 'Wpisz numer przesyłki', 'Szukaj', 'spinka']) assert.equal(isSensitiveField({ tag: 'input', label }), false, label);
});
test('neighboring identifiers cannot defeat whole-token masking', () => {
  for (const [input, expected] of [
    ['PESEL 44051401359 600100200', 'PESEL [ukryte] 600100200'],
    ['44051401359 44051401359', '[ukryte] [ukryte]'],
    ['4111111111111111 600100200', '[ukryte] 600100200'],
    ['44051401359 4111 1111 1111 1111', '[ukryte] [ukryte]'],
    ['123456789012345678901234 44051401359', '123456789012345678901234 [ukryte]'],
    ['12345678 44051401359', '12345678 [ukryte]'],
    ['PESEL 440 514 013 59 600 100 200', 'PESEL [ukryte] 600 100 200'],
  ]) assert.equal(maskText(input!), expected);
});
