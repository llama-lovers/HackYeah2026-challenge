import assert from 'node:assert/strict';
import { STT_FAILED } from '../../src/shared/messages.pl.ts';
import { RECORDING_CAP_MS } from '../../src/shared/limits.ts';
import { waitForTarget, attach, evaluate } from '../cdp.mjs';
import { captureAssertions } from './audio.mjs';
export const name = 'wav';
export const timeoutMs = 60000;
export const buildEnv = { AUDIO_FORMAT: 'wav' };
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await ctx.speak(page, 'kliknij Znajdź');
  await ctx.waitForLive(page, 'Klikam Znajdź.');
  await ctx.waitIdle();
  await captureAssertions(ctx, page);
  assert(!(await ctx.liveLog(page)).includes(STT_FAILED));
  assert.match(ctx.proxyOutput(), /POST \/api\/transcribe -> 200/);
  const target = await waitForTarget(ctx.browser.port, target => target.url.endsWith('/offscreen/offscreen.html'));
  const session = await attach(ctx.client, target.id);
  const offscreenEval = expression => evaluate(ctx.client, session, expression);
  await offscreenEval(`(() => {
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => { const stream = await capture(constraints); globalThis.__testTracks = stream.getTracks(); return stream; };
    const upload = globalThis.fetch;
    globalThis.fetch = async (url, options) => {
      if (String(url).includes('/api/transcribe')) {
        const buffer = await options.body.arrayBuffer(); const view = new DataView(buffer);
        globalThis.__testAudio = {type:options.body.type,channels:view.getUint16(22,true),rate:view.getUint32(24,true),bits:view.getUint16(34,true),size:buffer.byteLength};
      }
      return upload(url, options);
    };
  })()`);
  const mark = await ctx.upstreamMark();
  const listeningCount = (await ctx.liveLog(page)).filter(text => text === 'Słucham.').length;
  const clickCount = (await ctx.liveLog(page)).filter(text => text === 'Klikam Znajdź.').length;
  await ctx.toggle();
  await ctx.waitForLive(page, log => log.filter(text => text === 'Słucham.').length > listeningCount);
  await ctx.waitForLive(page, log => log.filter(text => text === 'Klikam Znajdź.').length > clickCount, RECORDING_CAP_MS + 7000);
  await ctx.waitIdle();
  assert.equal((await ctx.upstreamSince(mark)).length, 1);
  assert(await offscreenEval('globalThis.__testTracks.every(track => track.readyState === "ended")'));
  const audio = await offscreenEval('globalThis.__testAudio');
  assert.equal(audio.type, 'audio/wav');
  assert.equal(audio.channels, 1); assert.equal(audio.rate, 16000); assert.equal(audio.bits, 16);
  assert(audio.size > 1000);
  const emptyMark = await ctx.upstreamMark();
  await ctx.speak(page, '   ');
  await ctx.waitForLive(page, 'Nic nie usłyszałem. Spróbuj jeszcze raz.');
  await ctx.waitIdle();
  assert.deepEqual(await ctx.upstreamSince(emptyMark), []);
}
