import assert from 'node:assert/strict';
import { attach, evaluate, waitFor, waitForTarget } from '../cdp.mjs';

export const name = 'recording';
export const timeoutMs = 30000;
export async function run(ctx) {
  await ctx.openPage('/fixtures/tracking-form.html');
  const target = await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'));
  const session = await attach(ctx.client, target.id);
  const offscreen = expression => evaluate(ctx.client, session, expression);
  await offscreen(`(() => {
    globalThis.__captureTiming = { starts: [], stops: [] };
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await original(constraints);
      for (const track of stream.getTracks()) {
        const stop = track.stop.bind(track);
        track.stop = () => { __captureTiming.stops.push(Date.now()); stop(); };
      }
      return stream;
    };
    const Recorder = MediaRecorder;
    globalThis.MediaRecorder = class extends Recorder {
      start(...args) { super.start(...args); __captureTiming.starts.push(Date.now()); }
    };
  })()`);
  const timings = [];
  for (let i = 0; i < 3; i++) {
    await ctx.swEval('globalThis.__startPressedAt = Date.now()');
    await ctx.toggle({ stubText: '' });
    await waitFor(async () => (await offscreen('__captureTiming.starts.length')) === i + 1, { label: 'microphone recording started' });
    await new Promise(resolve => setTimeout(resolve, 400));
    await ctx.swEval('globalThis.__stopPressedAt = Date.now()');
    await ctx.toggle();
    await waitFor(async () => (await offscreen('__captureTiming.stops.length')) >= i + 1, { label: 'microphone released' });
    const capture = await offscreen('__captureTiming');
    const start = capture.starts[i] - await ctx.swEval('__startPressedAt');
    const stop = capture.stops[i] - await ctx.swEval('__stopPressedAt');
    assert(stop < 500, `stop delayed by ${stop} ms`);
    timings.push({ startMs: start, stopMs: stop });
    await ctx.waitIdle();
  }
  console.log('  Virtual microphone timing: ' + JSON.stringify(timings));
}
