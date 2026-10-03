import assert from 'node:assert/strict';
import { waitFor, waitForTarget, attach, evaluate } from '../cdp.mjs';
export const name = 'lifecycle';
export const timeoutMs = 360000;
export const freshBrowser = true;
const WAIT = 'To trwa dłużej niż zwykle';
const EFFECT = log => log.some(line => line.startsWith('Zmiana'));
const count = (log, text) => log.filter(line => line === text).length;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const SCHEMA = request => request.response_format.json_schema.name;
// The speech-to-text upload runs in the offscreen document: every transcription is held back by __sttDelay before it is sent.
async function holdStt(ctx, ms) {
  const target = await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'));
  const session = await attach(ctx.client, target.id);
  await evaluate(ctx.client, session, `(() => { globalThis.__sttDelay = ${ms}; if (!globalThis.__sttHeld) { globalThis.__sttHeld = true; const real = fetch; globalThis.fetch = async (url, options) => { if (String(url).includes('/api/transcribe')) await new Promise(resolve => setTimeout(resolve, globalThis.__sttDelay)); return real(url, options); }; } return true; })()`);
}
// Model work runs in the worker: every /api/action request is held back by __modelDelay. The override disappears with a worker restart.
const holdModel = (ctx, ms) => ctx.swEval(`(() => { globalThis.__modelDelay = ${ms}; if (!globalThis.__modelHeld) { globalThis.__modelHeld = true; const real = fetch; globalThis.fetch = async (url, options) => { if (String(url).endsWith('/api/action')) await new Promise(resolve => setTimeout(resolve, globalThis.__modelDelay)); return real(url, options); }; } return true; })()`);
const clearError = page => page.evaluate("document.querySelector('#typingErrorMsgContainer').textContent = ''");
// A real recording turn: start, stop. Resolves with the time at which processing began (the shortcut was pressed).
async function say(ctx, page, phrase) {
  await ctx.speak(page, phrase);
  return Date.now();
}
const lastResponse = async ctx => (await ctx.swEval("chrome.storage.session.get('lastResponse')")).lastResponse;
export async function run(ctx) {
  try {
    await warmUp(ctx);
    await fastTurn(ctx);
    await slowStt(ctx);
    await slowSttAndModel(ctx);
    await tabClosure(ctx);
    await workerRestart(ctx);
    await navigationHandoff(ctx);
    await browserRestart(ctx);
  } finally {
    await ctx.swEval('(() => { if (globalThis.__modelHeld) { globalThis.__modelDelay = 0; } return true; })()').catch(() => {});
    await ctx.swEval("chrome.storage.local.remove('verbosity').then(() => true)").catch(() => {});
  }
}
// The first recording creates the offscreen document that the STT delay is installed into.
async function warmUp(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await ctx.speak(page, '   ');
  await ctx.waitForLive(page, 'Nic nie usłyszałem. Spróbuj jeszcze raz.');
  await ctx.waitIdle();
  await holdStt(ctx, 0);
}
// A turn that finishes before the deadline never hears the notice, not even later (its timer is cancelled with the turn).
async function fastTurn(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await clearError(page);
  await ctx.speak(page, 'kliknij Znajdź');
  await ctx.waitForLive(page, EFFECT);
  await ctx.waitIdle();
  await sleep(8800);
  assert.equal(count(await ctx.liveLog(page), WAIT), 0, 'no notice after a fast turn');
}
// STT alone is slower than the deadline: the clock started at the stop, so the notice arrives about eight seconds in, once, before the answer.
async function slowStt(ctx) {
  await holdStt(ctx, 10000);
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await clearError(page);
  const stopped = await say(ctx, page, 'kliknij Znajdź');
  await ctx.waitForLive(page, log => log.includes(WAIT), 15000);
  const elapsed = Date.now() - stopped;
  assert(elapsed >= 7000 && elapsed <= 9800, `notice after ${elapsed} ms`);
  await ctx.waitForLive(page, EFFECT, 15000);
  await ctx.waitIdle();
  const log = await ctx.liveLog(page);
  assert.equal(count(log, WAIT), 1);
  assert(log.indexOf('Przetwarzam.') < log.indexOf(WAIT) && log.indexOf(WAIT) < log.findIndex(line => line.startsWith('Zmiana')));
  // The notice is a routine status: "powtórz" repeats the answer, never the wait line.
  const replay = await lastResponse(ctx);
  assert(replay.text.startsWith('Zmiana') && replay.text !== WAIT);
  await holdStt(ctx, 0);
  await ctx.speak(page, 'powtórz');
  await waitFor(async () => count(await ctx.liveLog(page), replay.text) === 2, { label: 'replay of the answer' });
  await ctx.waitIdle();
  assert.equal(count(await ctx.liveLog(page), WAIT), 1);
  await sleep(9000);
  assert.equal(count(await ctx.liveLog(page), WAIT), 1, 'no duplicate notice later');
}
// Five seconds of STT plus five seconds of model work: the clock covers both phases and is not restarted at the boundary.
async function slowSttAndModel(ctx) {
  await holdStt(ctx, 5000);
  await holdModel(ctx, 5000);
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await clearError(page);
  const stopped = await say(ctx, page, 'kliknij Znajdź');
  await ctx.waitForLive(page, log => log.includes(WAIT), 15000);
  const elapsed = Date.now() - stopped;
  assert(elapsed >= 7000 && elapsed <= 9800, `notice after ${elapsed} ms, not after the transcript`);
  await ctx.waitForLive(page, EFFECT, 20000);
  assert(Date.now() - stopped >= 9500, 'the answer is later than the notice');
  await ctx.waitIdle();
  assert.equal(count(await ctx.liveLog(page), WAIT), 1);
  await holdModel(ctx, 0);
  await holdStt(ctx, 0);
}
// Closing the tab cancels the turn: no notice and no late STT result is delivered anywhere.
async function tabClosure(ctx) {
  await holdStt(ctx, 12000);
  await ctx.swEval("globalThis.__sent = []; globalThis.__origSend ??= chrome.tabs.sendMessage.bind(chrome.tabs); chrome.tabs.sendMessage = (tabId, message, ...rest) => { globalThis.__sent.push({ type: message.type, text: message.text }); return globalThis.__origSend(tabId, message, ...rest); }; true");
  try {
    const page = await ctx.openPage('/fixtures/tracking-form.html');
    const mark = await ctx.upstreamMark();
    await ctx.speak(page, 'kliknij Znajdź');
    await sleep(2500);
    await ctx.client.send('Target.closeTarget', { targetId: page.targetId });
    await ctx.waitIdle(15000);
    await sleep(12500);
    const sent = await ctx.swEval('globalThis.__sent');
    assert(!sent.some(message => message.type === 'ANNOUNCE' && message.text === WAIT), 'no notice for a closed tab');
    assert.equal((await ctx.upstreamSince(mark)).filter(request => SCHEMA(request) === 'action_proposal').length, 0, 'a late transcript starts nothing');
    assert.equal((await ctx.turnState()).phase, 'idle');
  } finally { await ctx.swEval('chrome.tabs.sendMessage = globalThis.__origSend; true'); await holdStt(ctx, 0); }
}
// The worker is killed in the middle of the wait: the stored absolute deadline survives, and the notice is still spoken once, on time.
async function workerRestart(ctx) {
  await holdStt(ctx, 12000);
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await clearError(page);
  const stopped = await say(ctx, page, 'kliknij Znajdź');
  await sleep(3000);
  const before = await ctx.turnState();
  assert.equal(before.phase, 'processing'); assert(before.processingDeadline > Date.now());
  await ctx.restartWorker();
  const after = await ctx.turnState();
  assert.equal(after.id, before.id); assert.equal(after.processingDeadline, before.processingDeadline, 'deadline is not reset by the restart');
  await ctx.waitForLive(page, log => log.includes(WAIT), 15000);
  const elapsed = Date.now() - stopped;
  assert(elapsed >= 7000 && elapsed <= 9800, `notice after ${elapsed} ms despite the worker restart`);
  await ctx.waitForLive(page, EFFECT, 20000);
  await ctx.waitIdle();
  assert.equal(count(await ctx.liveLog(page), WAIT), 1);
  await sleep(1500);
  assert.equal(count(await ctx.liveLog(page), WAIT), 1);
  await holdStt(ctx, 0);
}
// A navigation effect handed over to the next document: the notice stays single and the new document only hears the effect.
async function navigationHandoff(ctx) {
  await holdModel(ctx, 9000);
  try {
    const page = await ctx.openPage('/fixtures/tracking-form.html');
    const mark = await ctx.upstreamMark();
    await ctx.speak(page, 'kliknij Szukaj');
    await waitFor(async () => (await page.evaluate("JSON.stringify(window.__liveLog)")).includes(WAIT), { timeoutMs: 15000, label: 'notice in the old document' });
    await waitFor(() => page.evaluate("location.pathname === '/fixtures/szukaj.html'"), { timeoutMs: 20000, label: 'navigation' });
    await ctx.waitForLive(page, log => log.some(line => line.startsWith('Zmiana na stronie')), 15000);
    await ctx.waitIdle();
    const log = await ctx.liveLog(page);
    assert.equal(count(log, WAIT), 0, 'the new document does not repeat the notice');
    assert.equal((await ctx.upstreamSince(mark)).filter(request => SCHEMA(request) === 'effect_summary').length, 1);
    assert.equal(await ctx.swEval("chrome.storage.session.get('pendingEffect').then(s => s.pendingEffect ?? null)"), null);
  } finally { await holdModel(ctx, 0); }
}
// A same-profile browser restart keeps only the durable preference: the session deadline, the turn and the replay never come back.
async function browserRestart(ctx) {
  await ctx.swEval("chrome.storage.local.set({ verbosity: 'detailed' }).then(() => true)");
  await holdStt(ctx, 12000);
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await ctx.speak(page, 'co tu jest?');
  await sleep(1500);
  assert.equal((await ctx.turnState()).phase, 'processing');
  await ctx.restartBrowser();
  assert.deepEqual(await ctx.swEval('chrome.storage.local.get(null)'), { verbosity: 'detailed' });
  const session = await ctx.swEval('chrome.storage.session.get(null)');
  assert(!('turn' in session) || session.turn.phase === 'idle', JSON.stringify(Object.keys(session)));
  assert(!('lastResponse' in session) && !('pendingEffect' in session) && !('pending' in session), JSON.stringify(Object.keys(session)));
  const fresh = await ctx.openPage('/fixtures/tracking-form.html');
  await sleep(9500);
  assert.equal(count(await ctx.liveLog(fresh), WAIT), 0, 'a deadline never survives a browser restart');
  assert.equal((await ctx.turnState()).phase, 'idle');
}
