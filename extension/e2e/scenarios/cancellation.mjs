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
  await ctx.swEval(`(() => { const real = fetch; globalThis.fetch = async (url, options) => {
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
}
