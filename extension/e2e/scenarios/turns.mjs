import assert from 'node:assert/strict';
import { waitFor, waitForTarget, attach, evaluate } from '../cdp.mjs';
import { RECORDING_CAP_MS } from '../../src/shared/limits.ts';
export const name = 'turns';
export const timeoutMs = 60000;
export async function run(ctx) {
  let page = await ctx.openPage('/fixtures/tracking-form.html');
  await page.evaluate(`document.querySelector('#ShipmentNumber').value='873234987612340872938732';`);
  await ctx.toggle({ stubText: 'kliknij Znajdź' });
  await ctx.waitForLive(page, 'Słucham.');
  await new Promise(resolve => setTimeout(resolve, 800));
  await ctx.toggle(); await ctx.waitForLive(page, 'Przetwarzam.');
  await ctx.toggle(); await new Promise(resolve => setTimeout(resolve, 100)); await ctx.toggle();
  await ctx.waitForLive(page, log => log.filter(s => s === 'Jeszcze pracuję.').length === 2);
  await ctx.waitForLive(page, log => log.some(s => s.startsWith('Zmiana na stronie')));
  await ctx.waitIdle();
  const log = await ctx.liveLog(page);
  assert(log.indexOf('Słucham.') < log.indexOf('Przetwarzam.'));
  assert(log.indexOf('Przetwarzam.') < log.indexOf('Jeszcze pracuję.'));
  assert(log.indexOf('Przetwarzam.') < log.indexOf('Klikam Znajdź.'));
  assert(log.indexOf('Klikam Znajdź.') < log.findIndex(s => s.startsWith('Zmiana na stronie')));
  assert.equal(log.filter(s => s === 'Jeszcze pracuję.').length, 2);
  const mark = await ctx.upstreamMark();
  await ctx.speak(page, '   ');
  await ctx.waitForLive(page, 'Nic nie usłyszałem. Spróbuj jeszcze raz.');
  await ctx.waitIdle();
  assert.equal((await ctx.upstreamSince(mark)).filter(r => r.response_format.json_schema.name === 'action_proposal').length, 0);
  await ctx.openPage('about:blank');
  await ctx.swEval(`globalThis.__ttsLog=[];globalThis.__realTts=chrome.tts.speak;chrome.tts.speak=(text,options)=>__ttsLog.push({text,options});`);
  try {
    // Blank pages now accept browser commands without a content script.
    await ctx.toggle({ stubText: `przejdź na ${ctx.proxyOrigin}/fixtures/tracking-form.html` });
    await waitFor(async () => (await ctx.turnState()).phase === 'recording', { label: 'blank page records browser command' });
    assert.equal((await ctx.swEval('globalThis.__ttsLog')).some(s => s.text.includes('Tej strony nie obsługuję')), false);
    await new Promise(resolve => setTimeout(resolve, 800));
    await ctx.toggle();
    await ctx.waitIdle();
  } finally { await ctx.swEval('chrome.tts.speak=__realTts;delete globalThis.__realTts;'); }
  page = await ctx.openPage('/fixtures/tracking-form.html');
  // Automatic stop has no explicit REC_STOP test payload. Override only the test
  // transcriber URL so this capped capture really returns the requested phrase.
  const target = await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'));
  const session = await attach(ctx.client, target.id);
  const offscreenEval = expression => evaluate(ctx.client, session, expression);
  await offscreenEval(`globalThis.__capFetch=fetch;globalThis.fetch=(url,opts)=>__capFetch(String(url).includes('/api/transcribe') ? new URL('/api/transcribe?text='+encodeURIComponent('kliknij Pokaż mapę'),String(url)).href : url,opts);`);
  try {
    await ctx.toggle({ stubText: 'kliknij Pokaż mapę' });
    await ctx.waitForLive(page, 'Słucham.');
    const listeningAt = Date.now();
    await ctx.waitForLive(page, 'Przetwarzam.', RECORDING_CAP_MS + 3000);
    const elapsed = Date.now() - listeningAt;
    assert(elapsed >= RECORDING_CAP_MS - 1000 && elapsed <= RECORDING_CAP_MS + 3000, `automatic cap ${elapsed} ms`);
    await ctx.waitForLive(page, 'Klikam Pokaż mapę.');
    await ctx.waitForLive(page, 'Kliknąłem Pokaż mapę, ale na stronie nic się nie zmieniło.');
    await ctx.waitIdle();
  } finally { await offscreenEval('globalThis.fetch=__capFetch;delete globalThis.__capFetch;'); }
}
