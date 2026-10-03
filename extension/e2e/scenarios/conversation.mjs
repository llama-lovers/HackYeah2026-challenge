import assert from 'node:assert/strict';
import { waitFor } from '../cdp.mjs';
export const name = 'conversation';
export const timeoutMs = 420000;
export const freshBrowser = true;
const SUMMARY = 'To strona „Śledzenie przesyłek (fixture)”. Główny nagłówek to „Śledź paczkę”.';
const RECOVERY = 'Nie udało się opisać tej strony. Spróbuj jeszcze raz za chwilę.';
const REPLAY_EMPTY = 'Nie mam nic do powtórzenia. Zapytaj na przykład, co tu jest.';
const userContent = request => request.messages.findLast(m => m.role === 'user').content;
const schemaName = request => request.response_format.json_schema.name;
const count = (log, text) => log.filter(s => s === text).length;
// Records every message the worker sends to a tab so the scenario can prove that a local command touched nothing but the live region.
const watchSent = async ctx => {
  await waitFor(() => ctx.swEval("typeof chrome !== 'undefined' && typeof chrome.tabs?.sendMessage === 'function'"), { label: 'worker chrome API' });
  return ctx.swEval(`globalThis.__sent = []; globalThis.__origSend ??= chrome.tabs.sendMessage.bind(chrome.tabs); chrome.tabs.sendMessage = (tabId, message, ...rest) => { globalThis.__sent.push(message.type); return globalThis.__origSend(tabId, message, ...rest); }; true`);
};
const resetSent = ctx => ctx.swEval('globalThis.__sent = []; true');
const sentTypes = ctx => ctx.swEval('globalThis.__sent');
const replayEntry = async ctx => (await ctx.swEval("chrome.storage.session.get('lastResponse')")).lastResponse;
const localStorageDump = ctx => ctx.swEval('chrome.storage.local.get(null)');
export async function run(ctx) {
  try {
    await replayScenario(ctx);
    await verbosityScenario(ctx);
  } finally {
    // The browser is shared with later scenarios: leave no preference behind.
    await ctx.swEval("chrome.storage.local.remove('verbosity').then(() => true)").catch(() => {});
  }
}
// OUT-03: exact, local, document-scoped replay through the existing live region.
async function replayScenario(ctx) {
  await watchSent(ctx);
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await ctx.speak(page, 'co tu jest?');
  await ctx.waitForLive(page, SUMMARY);
  await ctx.waitIdle();
  assert.deepEqual(Object.keys(await replayEntry(ctx)).sort(), ['docId', 'tabId', 'text'], 'one bounded entry');
  assert.equal((await replayEntry(ctx)).text, SUMMARY);
  // Two repeats: two separate live-region mutations of the identical Unicode text, nothing but the live region touched.
  const mark = await ctx.upstreamMark();
  await resetSent(ctx);
  for (const [phrase, expected] of [['powtórz', 2], ['Powtórz.', 3]]) {
    await ctx.speak(page, phrase);
    await waitFor(async () => count(await ctx.liveLog(page), SUMMARY) === expected, { label: `replay #${expected - 1}` });
    await ctx.waitIdle();
  }
  assert.equal(await ctx.upstreamMark(), mark, 'replay makes no provider request');
  assert.deepEqual((await sentTypes(ctx)).filter(type => !['PING', 'ANNOUNCE'].includes(type)), [], 'replay makes no snapshot or page action');
  assert.equal((await replayEntry(ctx)).text, SUMMARY, 'routine lines and replay never replace the original');
  // A recoverable error is the latest substantive message and is what gets repeated; a new summary replaces it.
  await page.evaluate("document.title = 'FAKE-MODEL:null'");
  await ctx.speak(page, 'co tu jest?');
  await ctx.waitForLive(page, RECOVERY);
  await ctx.waitIdle();
  await ctx.speak(page, 'powtórz');
  await waitFor(async () => count(await ctx.liveLog(page), RECOVERY) === 2, { label: 'error replay' });
  await ctx.waitIdle();
  await page.evaluate("document.title = 'Śledzenie przesyłek (fixture)'");
  await ctx.speak(page, 'co tu jest?');
  await waitFor(async () => count(await ctx.liveLog(page), SUMMARY) === 4, { label: 'new summary' });
  await ctx.waitIdle();
  assert.equal((await replayEntry(ctx)).text, SUMMARY);
  // Empty state in another tab: a fixed recovery with a next step, no provider or page action, and the other tab's entry is untouched.
  const before = await replayEntry(ctx);
  const other = await ctx.openPage('/fixtures/tracking-form.html');
  const emptyMark = await ctx.upstreamMark();
  await resetSent(ctx);
  await ctx.speak(other, 'powtórz');
  await ctx.waitForLive(other, REPLAY_EMPTY);
  await ctx.waitIdle();
  assert.equal(await ctx.upstreamMark(), emptyMark);
  assert.deepEqual((await sentTypes(ctx)).filter(type => !['PING', 'ANNOUNCE'].includes(type)), []);
  assert.deepEqual(await replayEntry(ctx), before, 'the status line did not become a response');
  // Navigation: after a reload the old document's text is never offered again.
  await ctx.client.send('Page.bringToFront', {}, page.sessionId);
  await ctx.client.send('Page.reload', {}, page.sessionId);
  await waitFor(() => page.evaluate("!!document.getElementById('voice-agent-live-region')"), { label: 'content script after reload' });
  await waitFor(async () => (await replayEntry(ctx)) === undefined, { label: 'replay invalidated by navigation' });
  await ctx.speak(page, 'powtórz');
  await ctx.waitForLive(page, REPLAY_EMPTY);
  await ctx.waitIdle();
  // Tab closure removes the entry of that tab.
  const closing = await ctx.openPage('/fixtures/tracking-form.html');
  await ctx.speak(closing, 'co tu jest?');
  await ctx.waitForLive(closing, SUMMARY);
  await ctx.waitIdle();
  assert((await replayEntry(ctx)) !== undefined);
  await ctx.client.send('Target.closeTarget', { targetId: closing.targetId });
  await waitFor(async () => (await replayEntry(ctx)) === undefined, { label: 'replay removed with its tab' });
  // Replay content is session-only: nothing page-derived is ever in durable storage.
  const durable = JSON.stringify(await localStorageDump(ctx));
  assert(!durable.includes('Śledz') && !durable.includes('lastResponse'), durable);
  await ctx.swEval('chrome.tabs.sendMessage = globalThis.__origSend; true');
}

const ACTIONS = {
  concise: 'Możesz otworzyć link Szukaj, wpisać tekst w pole Wpisz numer przesyłki i kliknąć przycisk Znajdź.',
  standard: 'Możesz otworzyć link Szukaj, wpisać tekst w pole Wpisz numer przesyłki, kliknąć przycisk Znajdź i kliknąć przycisk Pokaż mapę.',
  detailed: 'Możesz otworzyć link Szukaj, wpisać tekst w pole Wpisz numer przesyłki, kliknąć przycisk Znajdź, kliknąć przycisk Pokaż mapę i kliknąć przycisk Pomoc.',
};
const MAX_IDS = { concise: 3, standard: 4, detailed: 5 };
const AT_SHORTEST = 'Już odpowiadam najkrócej. Powiedz „dokładniej”, żebym dodał szczegółów.';
const AT_LONGEST = 'Już odpowiadam najdokładniej. Powiedz „krócej”, żebym skrócił odpowiedzi.';
const NOT_SAVED = 'Nie udało się zapisać ustawienia, więc zostaje poprzedni poziom szczegółowości. Spróbuj jeszcze raz.';
const SAID = { concise: 'Odpowiadam krótko.', standard: 'Odpowiadam standardowo.', detailed: 'Odpowiadam szczegółowo.' };
// OUT-04: three persistent levels that tune exploration and effect summaries without persisting anything page-derived.
async function verbosityScenario(ctx) {
  await ctx.swEval("chrome.storage.local.remove('verbosity').then(() => true)");
  await watchSent(ctx);
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  const level = async () => (await ctx.swEval("chrome.storage.local.get('verbosity')")).verbosity;
  const say = async (phrase, expected) => { await ctx.speak(page, phrase); await ctx.waitForLive(page, expected); await ctx.waitIdle(); };
  const asked = async (phrase, expected) => {
    const mark = await ctx.upstreamMark();
    await say(phrase, expected);
    return ctx.upstreamSince(mark);
  };
  const expectLevel = (requests, tier, mode) => {
    assert.deepEqual(requests.map(schemaName), ['page_exploration']);
    assert.match(userContent(requests[0]), new RegExp(`<mode>\\n${mode}\\n</mode>`));
    assert.match(userContent(requests[0]), new RegExp(`<verbosity>\\n${tier}\\n</verbosity>`));
    if (mode === 'actions') assert.match(userContent(requests[0]), new RegExp(`<max_ids>\\n${MAX_IDS[tier]}\\n</max_ids>`));
  };
  // Absent preference behaves as standard.
  expectLevel(await asked('co mogę zrobić?', ACTIONS.standard), 'standard', 'actions');
  assert.equal(await level(), undefined);
  // Every transition, with the endpoints saturating and the new level announced only after it was stored.
  await say('krócej', SAID.concise); assert.equal(await level(), 'concise');
  expectLevel(await asked('co mogę zrobić?', ACTIONS.concise), 'concise', 'actions');
  expectLevel(await asked('co tu jest?', 'To strona „Śledzenie przesyłek (fixture)”.'), 'concise', 'summary');
  await say('krócej', AT_SHORTEST); assert.equal(await level(), 'concise');
  await say('dokładniej', SAID.standard); assert.equal(await level(), 'standard');
  await say('dokładniej', SAID.detailed); assert.equal(await level(), 'detailed');
  await say('dokładniej', AT_LONGEST); assert.equal(await level(), 'detailed');
  expectLevel(await asked('co mogę zrobić?', ACTIONS.detailed), 'detailed', 'actions');
  expectLevel(await asked('co tu jest?', SUMMARY), 'detailed', 'summary');
  // Effect summaries follow the level; the executed action and diff evidence are unchanged.
  const effectLine = tier => log => log.some(line => tier === 'concise' ? line.startsWith('Zmiana: Wpisz poprawny') && line.length <= 60
    : line.startsWith('Zmiana na stronie: Wpisz poprawny') && line.endsWith('Sprawdź szczegóły na stronie.') === (tier === 'detailed'));
  const click = async tier => {
    await page.evaluate("document.querySelector('#typingErrorMsgContainer').textContent = ''");
    const mark = await ctx.upstreamMark();
    await ctx.speak(page, 'kliknij Znajdź');
    await ctx.waitForLive(page, effectLine(tier));
    await ctx.waitIdle();
    const effect = (await ctx.upstreamSince(mark)).filter(r => schemaName(r) === 'effect_summary');
    assert.equal(effect.length, 1);
    assert.match(userContent(effect[0]), new RegExp(`<verbosity>\\n${tier}\\n</verbosity>`));
    assert.match(userContent(effect[0]), /"kind":"click","name":"Znajdź"/);
    assert.match(userContent(effect[0]), /Wpisz poprawny numer przesyłki/);
  };
  await click('detailed');
  await say('krócej', SAID.standard); await click('standard');
  await say('krócej', SAID.concise); await click('concise');
  // Repeat replays the original text; a level change never regenerates it.
  const effectText = (await replayEntry(ctx)).text;
  assert(effectText.startsWith('Zmiana: Wpisz poprawny'));
  const mark = await ctx.upstreamMark();
  await say('dokładniej', SAID.standard);
  assert.equal((await replayEntry(ctx)).text, effectText);
  await ctx.speak(page, 'powtórz');
  await waitFor(async () => count(await ctx.liveLog(page), effectText) === 2, { label: 'replay under another level' });
  await ctx.waitIdle();
  assert.equal(await ctx.upstreamMark(), mark, 'neither the level change nor the replay called the model');
  await say('krócej', SAID.concise);
  // Malformed durable data is treated as absent; the next step overwrites it with a valid value.
  for (const bad of ['bogus', '{"x":1}', '42']) {
    await ctx.swEval(`chrome.storage.local.set({ verbosity: ${bad.startsWith('{') || /^\d/.test(bad) ? bad : JSON.stringify(bad)} }).then(() => true)`);
    expectLevel(await asked('co mogę zrobić?', ACTIONS.standard), 'standard', 'actions');
  }
  await say('krócej', SAID.concise); assert.equal(await level(), 'concise');
  // A failed write is never announced as success and keeps the prior effective level.
  await ctx.swEval(`globalThis.__origLocalSet ??= chrome.storage.local.set.bind(chrome.storage.local); chrome.storage.local.set = () => Promise.reject(new Error('quota exceeded')); true`);
  try { await say('dokładniej', NOT_SAVED); } finally { await ctx.swEval('chrome.storage.local.set = globalThis.__origLocalSet; true'); }
  const afterFailure = await ctx.liveLog(page);
  assert(!afterFailure.slice(-6).includes(SAID.standard), 'no success claim after the failed write');
  assert.equal(await level(), 'concise');
  expectLevel(await asked('co mogę zrobić?', ACTIONS.concise), 'concise', 'actions');
  // Durable storage holds the enum and nothing else.
  assert.deepEqual(await ctx.swEval('chrome.storage.local.get(null)'), { verbosity: 'concise' });
  // A same-profile browser restart keeps the level and drops the session-only replay.
  await say('co tu jest?', 'To strona „Śledzenie przesyłek (fixture)”.');
  assert((await replayEntry(ctx)) !== undefined);
  await ctx.restartBrowser();
  assert.deepEqual(await ctx.swEval('chrome.storage.local.get(null)'), { verbosity: 'concise' });
  assert.equal(await replayEntry(ctx), undefined, 'replay does not survive a browser restart');
  const restarted = await ctx.openPage('/fixtures/tracking-form.html');
  await ctx.speak(restarted, 'powtórz');
  await ctx.waitForLive(restarted, REPLAY_EMPTY);
  await ctx.waitIdle();
  const afterRestart = await ctx.upstreamMark();
  await ctx.speak(restarted, 'co mogę zrobić?');
  await ctx.waitForLive(restarted, ACTIONS.concise);
  await ctx.waitIdle();
  const requests = await ctx.upstreamSince(afterRestart);
  expectLevel(requests, 'concise', 'actions');
}
