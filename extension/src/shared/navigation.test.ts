import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeNavigationUrl, parseNavigationCommand } from './navigation.ts';

test('explicit addresses support current and new tab commands and spoken dots', () => {
  for (const text of ['Przejdź na inpost.pl.', 'wejdź na stronę inpost kropka pe el', 'Otwórz adres https://inpost.pl', 'idź do inpost . pl']) {
    assert.deepEqual(parseNavigationCommand(text), { kind: 'navigate', url: 'https://inpost.pl/' }, text);
  }
  for (const text of ['Otwórz nową kartę z https://inpost.pl', 'otwórz nową zakładkę na inpost.pl', 'przejdź na inpost.pl w nowej karcie', 'otwórz inpost.pl w nowej zakładce']) {
    assert.deepEqual(parseNavigationCommand(text), { kind: 'new_tab', url: 'https://inpost.pl/' }, text);
  }
  assert.deepEqual(parseNavigationCommand('otwórz nową kartę'), { kind: 'new_tab' });
  assert.equal(normalizeNavigationUrl('https://example.com/CaseSensitive?Q=X#Top'), 'https://example.com/CaseSensitive?Q=X#Top');
  assert.equal(normalizeNavigationUrl('http://localhost:8788/fixtures/szukaj.html'), 'http://localhost:8788/fixtures/szukaj.html');
});

test('page clicks and dictation never become browser navigation', () => {
  for (const text of ['kliknij Szukaj', 'otwórz menu.', 'przejdź na cennik', 'wpisz przejdź na example.com w pole', 'powiedz otwórz nową kartę', 'otwórz stronę kontakt']) {
    assert.equal(parseNavigationCommand(text), null, text);
  }
});

test('natural requests for a new tab or exact URL do not require a page snapshot', () => {
  for (const text of ['otwórz mi nową kartę', 'Czy możesz otworzyć nową zakładkę?', 'Chcę otworzyć nową kartę', 'otwórz proszę nową kartę', 'otwórz nową zakładkę proszę']) {
    assert.deepEqual(parseNavigationCommand(text), { kind: 'new_tab' }, text);
  }
  assert.deepEqual(parseNavigationCommand('Proszę, wejdź mi na wikipedia.org.'), { kind: 'navigate', url: 'https://wikipedia.org/' });
});

test('invalid, ambiguous and privileged URLs do not produce navigation commands', () => {
  for (const address of ['javascript:alert(1)', 'data:text/html,x', 'file:///C:/a', 'chrome://settings', 'https://user:pass@example.com', 'https://example.com\\@evil.com', 'https://example.com\n', 'example.com i usuń kartę', 'http://', 'https://bad_host.com', 'www', 'x'.repeat(2050)]) {
    assert.equal(normalizeNavigationUrl(address), null, address);
  }
  for (const text of ['otwórz adres javascript:alert(1)', 'otwórz adres chrome://settings', 'otwórz nową kartę z nieznaną stroną']) {
    assert.deepEqual(parseNavigationCommand(text), { kind: 'invalid_url' }, text);
  }
});
