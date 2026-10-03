import test from 'node:test';
import assert from 'node:assert/strict';
import * as m from './messages.pl.ts';
import type { RejectReason } from './validate.ts';
test('announces validated actions and unchanged effects in exact Polish', () => {
  assert.equal(m.clickPre('Znajdź'), 'Klikam Znajdź.');
  assert.equal(m.fillPre('Wpisz numer przesyłki'), 'Wpisuję w pole Wpisz numer przesyłki.');
  assert.equal(m.noChange('click', 'Szukaj'), 'Kliknąłem Szukaj, ale na stronie nic się nie zmieniło.');
  assert.equal(m.noChange('fill', 'Numer'), 'Wpisałem tekst w pole Numer, ale na stronie nic się nie zmieniło.');
  assert.equal(m.effectFallback('click', 'Znajdź'), 'Kliknąłem Znajdź. Strona się zmieniła, ale nie udało mi się jej opisać.');
  assert.equal(m.effectFallback('fill', 'Numer'), 'Wpisałem tekst w pole Numer. Strona się zmieniła, ale nie udało mi się jej opisać.');
});
test('every rejection is spoken and unsafe actions require confirmation', () => {
  const reasons: RejectReason[] = ['unknown_action', 'not_found', 'stale', 'hidden', 'disabled', 'role_mismatch', 'sensitive_fill', 'empty_text', 'too_long', 'needs_confirmation', 'irreversible'];
  for (const reason of reasons) assert.match(m.rejectionText(reason), /.+\.$/u);
  for (const reason of ['needs_confirmation', 'irreversible'] as const) assert.equal(m.rejectionText(reason), 'Tej akcji nie wykonam bez potwierdzenia.');
});
test('none response collapses whitespace, caps code points and supplies fallback', () => {
  assert.equal(m.noneSay(' '), 'Nie rozumiem polecenia. Powiedz je inaczej.');
  assert.equal(m.noneSay(' a\n b '), 'a b');
  assert.equal(Array.from(m.noneSay('😀'.repeat(400))).length, 300);
});
