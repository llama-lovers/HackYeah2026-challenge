import assert from 'node:assert/strict';
import { STT_FAILED } from '../../src/shared/messages.pl.ts';
export const name = 'wav';
export const buildEnv = { AUDIO_FORMAT: 'wav' };
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await ctx.speak(page, 'kliknij Znajdź');
  await ctx.waitForLive(page, 'Klikam Znajdź.');
  await ctx.waitIdle();
  assert(!(await ctx.liveLog(page)).includes(STT_FAILED));
  assert.match(ctx.proxyOutput(), /POST \/api\/transcribe -> 200/);
}
