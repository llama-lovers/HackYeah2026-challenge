import assert from 'node:assert/strict';
import { waitFor, waitForTarget, attach, evaluate, listTargets } from '../cdp.mjs';
import * as msg from '../../src/shared/messages.pl.ts';
export const name = 'errors';
export const timeoutMs = 420000;
export const freshBrowser = true;
// A recognisable string that must never be spoken, shown or logged: it is planted in every injected body, status text, exception and utterance.
const CANARY = 'CANARY-7f3a-raw-diagnostic';
const UTTERANCE_CANARY = 'CANARYUTTERANCE9921';
const OPENING = ['Słucham.', 'Przetwarzam.'];
const count = (log, text) => log.filter(line => line === text).length;
const offscreenSession = async ctx => attach(ctx.client, (await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'))).id);
// Speech-to-text and microphone faults are injected where they really happen: in the offscreen document's fetch and getUserMedia.
async function installOffscreen(ctx) {
  const session = await offscreenSession(ctx);
  await evaluate(ctx.client, session, `(() => {
    if (globalThis.__errInstalled) return true; globalThis.__errInstalled = true;
    const CANARY = ${JSON.stringify(CANARY)};
    const real = fetch; globalThis.__sttMode = ''; globalThis.__micMode = '';
    const json = (status, body) => new Response(JSON.stringify(body), { status, statusText: CANARY, headers: { 'content-type': 'application/json' } });
    globalThis.fetch = async (url, options) => {
      const mode = globalThis.__sttMode;
      if (!String(url).includes('/api/transcribe') || !mode) return real(url, options);
      switch (mode) {
        case 'status502': return json(502, { error: 'provider_error', detail: CANARY });
        case 'status504': return json(504, { error: 'timeout' });
        case 'status503': return json(503, { error: 'no_api_key' });
        case 'status500': return json(500, { error: CANARY });
        case 'status404': return json(404, { error: CANARY });
        case 'reject': throw new TypeError('Failed to fetch ' + CANARY);
        case 'timeout': throw new DOMException(CANARY, 'TimeoutError');
        case 'badjson': return new Response('<html>' + CANARY, { status: 200 });
        case 'badshape': return json(200, { text: 42 });
        case 'huge': return json(200, { text: 'x'.repeat(5000) });
        case 'empty': return json(200, { text: '' });
        default: return real(url, options);
      }
    };
    const realMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const mode = globalThis.__micMode;
      if (mode === 'denied') throw new DOMException(CANARY, 'NotAllowedError');
      if (mode === 'missing') throw new DOMException(CANARY, 'NotFoundError');
      if (mode === 'other') throw new DOMException(CANARY, 'AbortError');
      return realMedia(constraints);
    };
    return true;
  })()`);
  return session;
}
// Proxy/model faults and page-side faults are injected in the worker: its fetch and the messages it sends to the tab.
const installWorker = ctx => ctx.swEval(`(() => {
  if (globalThis.__errInstalled) return true; globalThis.__errInstalled = true;
  const CANARY = ${JSON.stringify(CANARY)};
  const real = fetch; globalThis.__realFetchErr = real; globalThis.__apiMode = {}; globalThis.__tabMode = ''; globalThis.__execMode = ''; globalThis.__passed = [];
  const json = (status, body) => new Response(JSON.stringify(body), { status, statusText: CANARY, headers: { 'content-type': 'application/json' } });
  const bodies = { malformed_null: null, malformed_empty: {}, malformed_array: [], malformed_string: 'click', malformed_action: { action: 'teleport', target: 'e1', text: '', needs_confirmation: false, say: '' },
    malformed_target: { action: 'click', target: '', text: '', needs_confirmation: false, say: '' }, malformed_flag: { action: 'click', target: 'e1', text: '', needs_confirmation: 'no', say: '' },
    malformed_missing: { action: 'click', target: 'e1' }, malformed_say: { say: 7 }, malformed_list: { sentences: 5, candidate_ids: [] } };
  globalThis.fetch = async (url, options) => {
    const path = String(url).replace(/^https?:\\/\\/[^/]+/, '');
    const mode = globalThis.__apiMode[path];
    if (!mode) return real(url, options);
    if (mode in bodies) return json(200, bodies[mode]);
    switch (mode) {
      case 'no_api_key': return json(503, { error: 'no_api_key', detail: CANARY });
      case 'upstream_timeout': return json(502, { error: 'upstream_timeout' });
      case 'upstream_unreachable': return json(502, { error: 'upstream_unreachable' });
      case 'model_invalid_output': return json(502, { error: 'model_invalid_output' });
      case 'upstream_500': return json(502, { error: 'upstream_500' });
      case 'canary_code': return json(502, { error: CANARY });
      case 'reject': throw new TypeError('Failed to fetch ' + CANARY);
      case 'timeout': throw new DOMException(CANARY, 'TimeoutError');
      case 'badjson': return new Response('<html>' + CANARY, { status: 200 });
      default: return real(url, options);
    }
  };
  globalThis.__origSend ??= chrome.tabs.sendMessage.bind(chrome.tabs);
  chrome.tabs.sendMessage = async (tabId, message, ...rest) => {
    if (message.type === 'SNAPSHOT' && globalThis.__tabMode === 'snapshot_fail') return { ok: false, error: 'snapshot_failed' };
    if (message.type === 'SNAPSHOT' && globalThis.__tabMode === 'snapshot_throw') throw new Error(CANARY);
    if (message.type === 'CANDIDATES' && globalThis.__tabMode === 'snapshot_fail') return { ok: false, error: 'snapshot_failed' };
    if (message.type === 'EXECUTE' && globalThis.__execMode) {
      if (globalThis.__execMode === 'throw') throw new Error(CANARY);
      return { ok: false, reason: globalThis.__execMode };
    }
    if (message.type !== 'ANNOUNCE' && message.type !== 'PING') globalThis.__passed.push(message.type);
    return globalThis.__origSend(tabId, message, ...rest);
  };
  return true;
})()`);
const setApi = (ctx, path, mode) => ctx.swEval(`(globalThis.__apiMode[${JSON.stringify(path)}] = ${JSON.stringify(mode)}, true)`);
const resetWorkerFaults = ctx => ctx.swEval("(globalThis.__apiMode = {}, globalThis.__tabMode = '', globalThis.__execMode = '', true)");
const passedToPage = ctx => ctx.swEval('globalThis.__passed');
// Closes anything a failure opened (the options page after a denied microphone) and returns to the fixture page.
async function focus(ctx, page) {
  for (const target of await listTargets(ctx.browser.port)) if (target.type === 'page' && target.url.includes('/options/options.html')) await ctx.client.send('Target.closeTarget', { targetId: target.id });
  await ctx.client.send('Page.bringToFront', {}, page.sessionId);
}
async function assertCleanTurn(ctx) {
  await ctx.waitIdle(15000);
  const stored = await ctx.swEval('chrome.storage.session.get(null)');
  assert(!('pending' in stored) && !('pendingEffect' in stored), 'no pending interaction or effect job is left: ' + Object.keys(stored));
  assert.equal(stored.turn.phase, 'idle');
}
// One injected failure: the user speaks (or fails to), exactly one fixed line is heard, nothing leaks, nothing reaches the page, the turn is released.
async function expectLine(ctx, page, expected, label, { speak = 'kliknij Znajdź', record = true, allow = [] } = {}) {
  await ctx.swEval('globalThis.__passed = []; true');
  const before = (await ctx.liveLog(page)).length;
  if (speak !== null) await ctx.speak(page, speak);
  try { await ctx.waitForLive(page, log => log.slice(before).includes(expected), 12000); }
  catch (error) { throw new Error(`${label}: ${error.message}; log tail ${JSON.stringify((await ctx.liveLog(page)).slice(-5))}`); }
  await assertCleanTurn(ctx);
  const lines = (await ctx.liveLog(page)).slice(before).filter(line => !OPENING.includes(line) && !allow.includes(line));
  assert.deepEqual(lines, [expected], `${label}: exactly one terminal line`);
  assert(expected.trim().length > 0 && Array.from(expected).length <= 260, `${label}: bounded`);
  assert(!JSON.stringify(lines).includes('CANARY'), `${label}: no raw diagnostics spoken`);
  if (record) assert(!(await passedToPage(ctx)).includes('EXECUTE'), `${label}: nothing was executed on the page`);
}
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  // The first recording creates the offscreen document, which the speech-to-text and microphone faults are installed into.
  await ctx.speak(page, '   ');
  await ctx.waitForLive(page, 'Nic nie usłyszałem. Spróbuj jeszcze raz.');
  await ctx.waitIdle();
  await installWorker(ctx);
  const offscreen = await installOffscreen(ctx);
  const sttMode = mode => evaluate(ctx.client, offscreen, `(globalThis.__sttMode = ${JSON.stringify(mode)}, true)`);
  const micMode = mode => evaluate(ctx.client, offscreen, `(globalThis.__micMode = ${JSON.stringify(mode)}, true)`);
  const proxyLogBefore = ctx.proxyOutput().length;
  try {
    // Speech-to-text: every typed category has its own plain sentence; silence is "nothing heard".
    const stt = { status502: msg.STT_FAILED, status500: msg.STT_FAILED, status504: msg.STT_TIMEOUT, timeout: msg.STT_TIMEOUT, status503: msg.NOT_CONFIGURED, reject: msg.NETWORK_FAILED, status404: msg.NETWORK_FAILED,
      badjson: msg.STT_INVALID, badshape: msg.STT_INVALID, huge: msg.STT_INVALID, empty: msg.NOTHING_HEARD };
    for (const [mode, expected] of Object.entries(stt)) {
      await sttMode(mode);
      await expectLine(ctx, page, expected, `stt ${mode}`);
    }
    await sttMode('');
    // Microphone: real getUserMedia failures, classified by the offscreen document.
    for (const [mode, expected] of [['denied', msg.MIC_DENIED], ['missing', msg.MIC_NO_DEVICE], ['other', msg.MIC_FAILED]]) {
      await micMode(mode);
      await ctx.swEval('globalThis.__passed = []; true');
      const before = (await ctx.liveLog(page)).length;
      await ctx.toggle({ stubText: 'kliknij Znajdź' });
      await ctx.waitForLive(page, log => log.slice(before).includes(expected), 12000);
      await assertCleanTurn(ctx);
      assert.deepEqual((await ctx.liveLog(page)).slice(before), [expected], `mic ${mode}`);
      await focus(ctx, page);
    }
    await micMode('');
    // Model and proxy: classified by category, never by body; the utterance canary must not come back in any line.
    const action = { no_api_key: msg.NOT_CONFIGURED, upstream_timeout: msg.ASSISTANT_TIMEOUT, timeout: msg.ASSISTANT_TIMEOUT, upstream_unreachable: msg.NETWORK_FAILED, reject: msg.NETWORK_FAILED,
      model_invalid_output: msg.ASSISTANT_INVALID, badjson: msg.ASSISTANT_INVALID, upstream_500: msg.ASSISTANT_FAILED, canary_code: msg.ASSISTANT_FAILED };
    for (const [mode, expected] of Object.entries(action)) {
      await setApi(ctx, '/api/action', mode);
      await expectLine(ctx, page, expected, `action ${mode}`, { speak: 'kliknij Znajdź ' + UTTERANCE_CANARY });
    }
    // Success bodies that do not decode execute nothing at all.
    for (const mode of ['malformed_null', 'malformed_empty', 'malformed_array', 'malformed_string', 'malformed_action', 'malformed_target', 'malformed_flag', 'malformed_missing', 'malformed_say']) {
      await setApi(ctx, '/api/action', mode);
      await expectLine(ctx, page, msg.ASSISTANT_INVALID, `action ${mode}`);
    }
    await resetWorkerFaults(ctx);
    // Page exploration failures.
    for (const [mode, expected] of [['upstream_500', msg.EXPLORE_FAILED], ['no_api_key', msg.NOT_CONFIGURED], ['reject', msg.NETWORK_FAILED], ['malformed_list', msg.EXPLORE_FAILED], ['model_invalid_output', msg.EXPLORE_FAILED]]) {
      await setApi(ctx, '/api/explore', mode);
      await expectLine(ctx, page, expected, `explore ${mode}`, { speak: 'co tu jest?' });
    }
    for (const [mode, expected] of [['upstream_500', msg.ACTIONS_FAILED], ['timeout', msg.ASSISTANT_TIMEOUT], ['malformed_list', msg.ACTIONS_FAILED]]) {
      await setApi(ctx, '/api/explore', mode);
      await expectLine(ctx, page, expected, `actions ${mode}`, { speak: 'co mogę zrobić?' });
    }
    await resetWorkerFaults(ctx);
    // Page side: the snapshot cannot be taken, delivery of the action fails, or the element is refused.
    await ctx.swEval("(globalThis.__tabMode = 'snapshot_fail', true)");
    await expectLine(ctx, page, msg.SNAPSHOT_FAILED, 'snapshot failed');
    await expectLine(ctx, page, msg.SNAPSHOT_FAILED, 'snapshot failed (exploration)', { speak: 'co tu jest?' });
    await ctx.swEval("(globalThis.__tabMode = 'snapshot_throw', true)");
    await expectLine(ctx, page, msg.SNAPSHOT_FAILED, 'snapshot unreachable');
    await ctx.swEval("(globalThis.__tabMode = '', true)");
    await ctx.swEval("(globalThis.__execMode = 'throw', true)");
    await expectLine(ctx, page, msg.ACTION_FAILED, 'delivery failed', { record: false });
    for (const reason of ['not_found', 'stale', 'hidden', 'disabled', 'role_mismatch', 'too_long', 'unknown_action', 'empty_text', 'sensitive_fill']) {
      await ctx.swEval(`(globalThis.__execMode = ${JSON.stringify(reason)}, true)`);
      await expectLine(ctx, page, msg.rejectionText(reason), `element ${reason}`, { record: false });
    }
    await ctx.swEval("(globalThis.__execMode = '', true)");
    // Nothing above reached the page: the field is untouched and the lookup button was never clicked.
    assert.equal(await page.evaluate("document.querySelector('#ShipmentNumber').value"), '');
    assert.equal(await page.evaluate("document.querySelector('#typingErrorMsgContainer').textContent.trim()"), '', 'no click happened');
    assert(!(await passedToPage(ctx)).includes('EXECUTE'));
    // The action went through, but its effect could not be described: the page changed, and the line admits it without claiming a result.
    await setApi(ctx, '/api/effect', 'upstream_500');
    await ctx.swEval('globalThis.__passed = []; true');
    await expectLine(ctx, page, msg.effectFallback('click', 'Znajdź'), 'effect description failed', { record: false, allow: ['Klikam Znajdź.'] });
    assert.equal((await passedToPage(ctx)).filter(type => type === 'EXECUTE').length, 1, 'exactly one click');
    await setApi(ctx, '/api/effect', 'malformed_say');
    await page.evaluate("document.querySelector('#typingErrorMsgContainer').textContent = ''");
    await expectLine(ctx, page, msg.effectFallback('click', 'Znajdź'), 'effect body malformed', { record: false, allow: ['Klikam Znajdź.'] });
    // After every failure the pipeline still works: one more normal turn is answered.
    await resetWorkerFaults(ctx);
    await page.evaluate("document.querySelector('#typingErrorMsgContainer').textContent = ''");
    const before = (await ctx.liveLog(page)).length;
    await ctx.speak(page, 'kliknij Znajdź');
    await ctx.waitForLive(page, log => log.slice(before).some(line => line.startsWith('Zmiana')), 12000);
    await ctx.waitIdle();
    // Nothing the user said, no provider body and no exception text ever reached a spoken line or the proxy log.
    const allSpoken = JSON.stringify(await ctx.liveLog(page));
    assert(!allSpoken.includes('CANARY'), 'no raw diagnostics or utterance echoed in speech');
    assert(!ctx.proxyOutput().slice(proxyLogBefore).includes('CANARY'), 'no canary in the proxy log');
  } finally {
    await sttMode('').catch(() => {}); await micMode('').catch(() => {});
    await resetWorkerFaults(ctx).catch(() => {});
    await ctx.swEval('(chrome.tabs.sendMessage = globalThis.__origSend, globalThis.fetch = globalThis.__realFetchErr, true)').catch(() => {});
  }
}
