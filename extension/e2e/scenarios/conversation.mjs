import assert from 'node:assert/strict';
import { waitFor } from '../cdp.mjs';
export const name = 'conversation';
export const timeoutMs = 240000;
export const freshBrowser = true;
const SUMMARY = 'To strona „Śledzenie przesyłek (fixture)”. Główny nagłówek to „Śledź paczkę”.';
const RECOVERY = 'Nie udało się opisać tej strony. Spróbuj jeszcze raz za chwilę.';
const REPLAY_EMPTY = 'Nie mam nic do powtórzenia. Zapytaj na przykład, co tu jest.';
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
