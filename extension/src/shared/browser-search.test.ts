import test from 'node:test';
import assert from 'node:assert/strict';
import { googleSearchUrl, isBrowserStartPage, isGoogleSearchPage, isGoogleSearchHome, parseBrowserSearch } from './browser-search.ts';

test('search intent survives normalization and result selection stays with the model', () => {
  assert.deepEqual(parseBrowserSearch('Chcę znaleźć czerwone koty.'), { query: 'czerwone koty', newTab: false, addressBar: false });
  assert.equal(parseBrowserSearch('znajdź drugi wynik z Wikipedii', true, false), null);
  assert.deepEqual(parseBrowserSearch('wpisz koty w wyszukiwarkę', true, false), { query: 'koty', newTab: false, addressBar: false });
  assert(isGoogleSearchHome('https://www.google.com/'));
  assert(!isGoogleSearchHome('https://www.google.com/search?q=koty'));
});

test('complete search commands preserve the dictated query', () => {
  for (const text of ['wyszukaj paczkomaty w Warszawie', 'szukaj w Google paczkomaty w Warszawie', 'znajdź w internecie paczkomaty w Warszawie', 'wyszukaj paczkomaty w Warszawie w Google']) {
    assert.deepEqual(parseBrowserSearch(text), { query: 'paczkomaty w Warszawie', newTab: false, addressBar: false }, text);
  }
  assert.deepEqual(parseBrowserSearch('wyszukaj koty w nowej karcie'), { query: 'koty', newTab: true, addressBar: false });
  assert.deepEqual(parseBrowserSearch('wpisz inpost.pl w pasek adresu'), { query: 'inpost.pl', newTab: false, addressBar: true });
  assert.deepEqual(parseBrowserSearch('wpisz czerwone koty w pasku adresu'), { query: 'czerwone koty', newTab: false, addressBar: true });
});

test('natural speech and STT punctuation route to a complete browser search', () => {
  for (const text of ['Wyszukaj mi czerwone koty.', 'Chcę wyszukać czerwone koty.', 'Poszukaj czerwone koty.', 'Wyszukaj, proszę, czerwone koty.', 'Proszę, wyszukaj czerwone koty.', 'wyszukaj na stronie Google czerwone koty']) {
    assert.deepEqual(parseBrowserSearch(text), { query: 'czerwone koty', newTab: false, addressBar: false }, text);
  }
});

test('Google field/search commands submit only in verified Google context', () => {
  for (const text of ['wpisz czerwone koty w pole wyszukiwania', 'wpisz czerwone koty w wyszukiwarkę', 'wpisz czerwone koty w pole wyszukiwania i wyszukaj', 'wyszukaj na tej stronie czerwone koty']) {
    assert.equal(parseBrowserSearch(text), null, text);
    assert.deepEqual(parseBrowserSearch(text, true), { query: 'czerwone koty', newTab: false, addressBar: false }, text);
  }
  assert(isGoogleSearchPage('https://www.google.com/'));
  assert(isGoogleSearchPage('https://google.pl/search?q=koty'));
  for (const url of ['https://evil.google.com/', 'https://google.com.evil.test/', 'https://www.google.com/sorry/index', 'https://consent.google.com/', undefined]) assert.equal(isGoogleSearchPage(url), false);
});

test('page search, clicks and unrelated dictation remain page commands', () => {
  for (const text of ['kliknij Szukaj', 'wpisz wyszukaj koty w pole', 'znajdź paczkę', 'wyszukaj na tej stronie koty', 'wyszukaj na stronie paczkomaty', 'powiedz wyszukaj koty']) assert.equal(parseBrowserSearch(text), null, text);
  for (const text of ['wyszukaj', 'wyszukaj to', 'wyszukaj to co znalazłeś', 'wyszukaj to, co wpisałeś']) assert.equal(parseBrowserSearch(text), null);
  assert.deepEqual(parseBrowserSearch('wyszukaj w Google'), { invalid: true });
  assert.deepEqual(parseBrowserSearch('wyszukaj ' + 'x'.repeat(501)), { invalid: true });
});

test('search strings are encoded as data, not URLs or scripts', () => {
  const query = 'Zażółć & "koty" # javascript:alert(1)';
  const url = new URL(googleSearchUrl(query));
  assert.equal(url.origin, 'https://www.google.com');
  assert.equal(url.pathname, '/search');
  assert.equal(url.searchParams.get('q'), query);
  assert.equal(url.hash, '');
});

test('recognizes browser start-page variants only', () => {
  for (const url of ['chrome://newtab/', 'chrome://new-tab-page/', 'edge://newtab/', 'chrome-search://local-ntp/local-ntp.html']) assert.equal(isBrowserStartPage(url), true, url);
  for (const url of ['chrome://settings', 'chrome://version', 'https://google.com', undefined]) assert.equal(isBrowserStartPage(url), false, String(url));
});

test('natural searches and a new-tab search do not need an injectable DOM', () => {
  for (const text of ['Możesz wyszukać koty', 'wyszukaj mi proszę koty', 'Czy możesz mi wyszukać koty']) {
    assert.deepEqual(parseBrowserSearch(text), { query: 'koty', newTab: false, addressBar: false }, text);
  }
  assert.deepEqual(parseBrowserSearch('otwórz mi nową kartę i wyszukaj koty'), { query: 'koty', newTab: true, addressBar: false });
  assert.equal(parseBrowserSearch('wpisz koty'), null);
  assert.deepEqual(parseBrowserSearch('wpisz koty', true), { query: 'koty', newTab: false, addressBar: false });
  assert.deepEqual(parseBrowserSearch('znajdź koty', true), { query: 'koty', newTab: false, addressBar: false });
});
