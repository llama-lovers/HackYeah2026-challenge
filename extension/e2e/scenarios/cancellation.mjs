import assert from 'node:assert/strict';
import { waitFor, waitForTarget, attach, evaluate } from '../cdp.mjs';
export const name = 'cancellation';
export const freshBrowser = true;
export const timeoutMs = 120000;
const stop = ctx => ctx.swEval('globalThis.__voiceAgentTest.stop().then(() => true)');
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await ctx.toggle(); await ctx.waitForLive(page, 'Słucham.');
  const off = await attach(ctx.client, (await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'))).id);
  await evaluate(ctx.client, off, `(() => {
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    globalThis.__tracks = [];
    navigator.mediaDevices.getUserMedia = async options => {
      await new Promise(resolve => { globalThis.__openGate = resolve; });
      const stream = await real(options); globalThis.__tracks.push(...stream.getTracks()); return stream;
    };
    globalThis.__uploads = 0; const realFetch = fetch;
    globalThis.fetch = async (...args) => { globalThis.__uploads++; return realFetch(...args); };
    return true;
  })()`);
  await stop(ctx); await ctx.waitIdle();
  await ctx.toggle();
  await waitFor(() => evaluate(ctx.client, off, '!!globalThis.__openGate'), { label: 'held microphone opening' });
  await stop(ctx); await stop(ctx);
  await evaluate(ctx.client, off, 'globalThis.__openGate(); true');
  await waitFor(() => evaluate(ctx.client, off, 'globalThis.__tracks.length > 0 && globalThis.__tracks.every(t => t.readyState === "ended")'), { label: 'discarded opening tracks' });
  assert.equal(await evaluate(ctx.client, off, 'globalThis.__uploads'), 0);
  // Restore by reloading the offscreen document; the worker recreates it on the next command.
  await ctx.swEval('chrome.offscreen.closeDocument().then(() => true)');
  await ctx.toggle();
  await waitFor(() => ctx.liveLog(page).then(log => log.filter(t => t === 'Słucham.').length >= 2), { label: 'recording for held upload' });
  const uploadOff = await attach(ctx.client, (await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'))).id);
  await evaluate(ctx.client, uploadOff, `(() => { globalThis.__realUpload = fetch; globalThis.fetch = async (url, options) => {
    globalThis.__uploadSignal = options.signal; await new Promise(resolve => { globalThis.__releaseUpload = resolve; });
    return new Response(JSON.stringify({ text: 'kliknij Znajdź' }), { status: 200 });
  }; return true; })()`);
  await new Promise(resolve => setTimeout(resolve, 800)); await ctx.toggle();
  await waitFor(() => evaluate(ctx.client, uploadOff, '!!globalThis.__releaseUpload'), { label: 'held upload' });
  await stop(ctx);
  assert.equal(await evaluate(ctx.client, uploadOff, 'globalThis.__uploadSignal.aborted'), true, 'in-flight upload aborts');
  await evaluate(ctx.client, uploadOff, 'globalThis.__releaseUpload(); globalThis.fetch = globalThis.__realUpload; true');
  await ctx.waitIdle();
  const mark = await ctx.upstreamMark();
  await ctx.swEval(`(() => { const real = globalThis.__realModel = fetch; globalThis.fetch = async (url, options) => {
    if (String(url).endsWith('/api/action')) { globalThis.__heldAction = true; await new Promise(resolve => { globalThis.__releaseAction = resolve; }); }
    return real(url, options);
  }; return true; })()`);
  await ctx.speak(page, 'kliknij Znajdź');
  await waitFor(() => ctx.swEval('!!globalThis.__heldAction'), { label: 'held model request' });
  await ctx.toggle(); await ctx.waitIdle();
  await ctx.swEval('globalThis.__releaseAction(); true');
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal((await ctx.upstreamSince(mark)).length, 0, 'aborted local request does not start upstream work');
  const state = await ctx.swEval('chrome.storage.session.get(null)');
  assert(!state.pending && !state.pendingEffect);
  assert(!(await ctx.liveLog(page)).some(t => t.startsWith('Klikam') || t.startsWith('Zmiana')));
  for (const phrase of [' STOP! ', 'zatrzymaj']) { await ctx.speak(page, phrase); await ctx.waitIdle(); }
  assert.equal((await ctx.upstreamSince(mark)).length, 0, 'complete local stop never reaches a model');
  // The real command entry needs no active-page tab, including when options have focus.
  await ctx.toggle();
  await ctx.openPage(`chrome-extension://${ctx.extensionId}/options/options.html`);
  await ctx.swEval(`globalThis.__voiceAgentTest.command('stop-listening'); true`);
  await ctx.waitIdle();
  // Both alternating live nodes and the waiting queue are cancelled; no replay update is allowed.
  await ctx.swEval(`chrome.storage.session.remove('lastResponse').then(() => true)`);
  const tabId = await ctx.swEval(`chrome.tabs.query({}).then(tabs => tabs.find(t => t.url?.endsWith('/fixtures/tracking-form.html')).id)`);
  await ctx.swEval(`globalThis.__voiceAgentTest.announce(${tabId}, 'Cancelled queued line'); globalThis.__voiceAgentTest.stop(); true`);
  await ctx.waitIdle(); await new Promise(resolve => setTimeout(resolve, 500));
  assert(!(await ctx.liveLog(page)).includes('Cancelled queued line'));
  assert.equal((await ctx.swEval("chrome.storage.session.get('lastResponse')")).lastResponse, undefined);
  await ctx.swEval('globalThis.fetch = globalThis.__realModel; true');
  const actionPage = await ctx.openPage('/fixtures/tracking-form.html');
  await actionPage.evaluate(`globalThis.__clickCount = 0; document.addEventListener('click', () => globalThis.__clickCount++); true`);
  await ctx.speak(actionPage, 'kliknij Znajdź');
  await ctx.waitForLive(actionPage, log => log.some(t => t.startsWith('Klikam')));
  await stop(ctx); await ctx.waitIdle();
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(await actionPage.evaluate('globalThis.__clickCount'), 0, 'stop during pre-action delay prevents click');
  // Hold the storage write at the final worker commit, then cancel while the content awaits its acknowledgement.
  await ctx.swEval(`(() => { const real = chrome.storage.session.set.bind(chrome.storage.session); globalThis.__realSet = real;
    chrome.storage.session.set = async data => { if (data.pendingEffect?.state === 'executed') await new Promise(resolve => { globalThis.__releaseCommit = resolve; }); return real(data); }; return true; })()`);
  await ctx.speak(actionPage, 'kliknij Znajdź');
  await waitFor(() => ctx.swEval('!!globalThis.__releaseCommit'), { label: 'final worker commit' });
  await ctx.swEval('globalThis.__stopDone = globalThis.__voiceAgentTest.stop(); true');
  await ctx.swEval('globalThis.__releaseCommit(); chrome.storage.session.set = globalThis.__realSet; true');
  await ctx.waitIdle(); await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await actionPage.evaluate('globalThis.__clickCount'), 0, 'cancelled commit never authorizes click');
  await ctx.speak(actionPage, 'kliknij Znajdź');
  await waitFor(() => actionPage.evaluate('globalThis.__clickCount === 1'), { label: 'committed synchronous click' });
  await stop(ctx); await ctx.waitIdle();
  assert.equal(await actionPage.evaluate('globalThis.__clickCount'), 1, 'stop does not undo an already committed click');
  assert(!(await ctx.liveLog(actionPage)).some(t => /cofn|odwróci/iu.test(t)));
  // Deterministic TTS adapter exercises terminal-event ownership; this does not assert audible Polish voice quality.
  await ctx.swEval(`(() => {
    globalThis.__ttsLines = []; globalThis.__realTts = chrome.tts.speak; globalThis.__realVoices = chrome.tts.getVoices;
    chrome.tts.getVoices = async () => [{ lang: 'pl-PL', voiceName: 'Test Polish voice', remote: true }];
    chrome.tts.speak = (text, opts) => { globalThis.__ttsLines.push(text); if (text.startsWith('Klikam')) globalThis.__ttsEnd = opts.onEvent; else setTimeout(() => opts.onEvent({ type: 'end' }), 10); return Promise.resolve(); };
    return chrome.storage.local.set({ outputMode: 'browser_tts' }).then(() => true);
  })()`);
  await ctx.waitIdle();
  await ctx.client.send('Page.bringToFront', {}, actionPage.sessionId);
  const liveBefore = (await ctx.liveLog(actionPage)).length;
  await ctx.toggle({ stubText: 'kliknij Znajdź' });
  await new Promise(resolve => setTimeout(resolve, 900)); await ctx.toggle();
  await waitFor(() => ctx.swEval('!!globalThis.__ttsEnd'), { label: 'TTS pre-action completion gate' });
  assert.equal(await actionPage.evaluate('globalThis.__clickCount'), 1, 'pre-action waits for terminal TTS');
  assert.deepEqual((await ctx.liveLog(actionPage)).slice(liveBefore), [], 'browser route writes no page live text');
  await stop(ctx); await ctx.swEval(`globalThis.__ttsEnd({ type: 'end' }); globalThis.__ttsEnd = undefined; true`);
  await new Promise(resolve => setTimeout(resolve, 500));
  assert.equal(await actionPage.evaluate('globalThis.__clickCount'), 1, 'late TTS end cannot authorize action');
  // A route change cancels the same awaiting action and retains screen-reader mode.
  await ctx.toggle({ stubText: 'kliknij Znajdź' }); await new Promise(resolve => setTimeout(resolve, 900)); await ctx.toggle();
  await waitFor(() => ctx.swEval('!!globalThis.__ttsEnd'), { label: 'TTS before route change' });
  await ctx.swEval("chrome.storage.local.set({ outputMode: 'screen_reader' }).then(() => true)"); await ctx.waitIdle();
  await ctx.swEval(`globalThis.__ttsEnd({ type: 'end' }); true`);
  assert.equal(await actionPage.evaluate('globalThis.__clickCount'), 1);
  await ctx.swEval(`chrome.tts.speak = globalThis.__realTts; chrome.tts.getVoices = globalThis.__realVoices; globalThis.__ttsCount = 0; chrome.tts.speak = () => { globalThis.__ttsCount++; }; true`);
  // Unsupported-page recovery stays inside the trusted extension document and never silently invokes TTS.
  await ctx.openPage('chrome://version/'); await ctx.toggle(); await ctx.waitIdle();
  const options = await attach(ctx.client, (await waitForTarget(ctx.browser.port, t => t.url === `chrome-extension://${ctx.extensionId}/options/options.html`)).id);
  await waitFor(() => evaluate(ctx.client, options, `document.activeElement?.id === 'output-recovery' && document.querySelector('#output-recovery').getAttribute('role') === 'alert'`), { label: 'focused trusted recovery alert' });
  assert.match(await evaluate(ctx.client, options, `document.querySelector('#output-recovery').textContent`), /Tej strony nie obsługuję/u);
  assert.equal(await ctx.swEval('globalThis.__ttsCount'), 0);
  assert.equal((await ctx.swEval("chrome.storage.session.get('outputRecovery')")).outputRecovery, 'page_unsupported');
  await evaluate(ctx.client, options, `document.querySelector('#ack-recovery').click(); true`);
  await waitFor(() => ctx.swEval("chrome.storage.session.get('outputRecovery').then(s => s.outputRecovery === undefined)"), { label: 'recovery acknowledged' });
  await ctx.swEval("globalThis.__voiceAgentTest.announce(2147483647, 'Untrusted missing-context text').then(() => true)");
  await waitFor(() => evaluate(ctx.client, options, `document.activeElement?.id === 'output-recovery' && !document.querySelector('#output-recovery').hidden`), { label: 'missing receiver trusted recovery' });
  assert.equal((await ctx.swEval("chrome.storage.session.get('outputRecovery')")).outputRecovery, 'page_access');
  assert(!(await evaluate(ctx.client, options, `document.body.textContent`)).includes('Untrusted missing-context text'));
  assert.equal(await ctx.swEval('globalThis.__ttsCount'), 0);
  await evaluate(ctx.client, options, `document.querySelector('#ack-recovery').click(); true`);
  await ctx.swEval('chrome.tts.speak = globalThis.__realTts; true');
}
