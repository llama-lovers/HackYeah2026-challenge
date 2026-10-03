import assert from 'node:assert/strict';
export const name = 'choice';
export const timeoutMs = 60000;
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/ambiguous.html');
  const mark = await ctx.upstreamMark();
  await ctx.speak(page, 'kliknij szczegóły paczki');
  await ctx.waitForLive(page, 'Pasuje kilka elementów. Jeden: Szczegóły paczki z Krakowa. Dwa: Szczegóły paczki z Gdańska. Trzy: Szczegóły paczki z Poznania. Który? Powiedz numer.');
  await ctx.waitIdle(); assert.equal(await page.evaluate('window.__opened'), undefined);
  const replyMark = await ctx.upstreamMark();
  await ctx.speak(page, 'dwa');
  await ctx.waitForLive(page, 'Klikam Szczegóły paczki z Gdańska.');
  await ctx.waitForLive(page, 'Zmiana na stronie: Szczegóły paczki: Gdańsk'); await ctx.waitIdle();
  assert.equal(await page.evaluate('window.__opened'), 'Gdańsk');
  assert(!(await ctx.upstreamSince(replyMark)).some(r=>r.response_format.json_schema.name==='action_proposal'));
  assert.equal((await ctx.upstreamSince(mark)).filter(r=>r.response_format.json_schema.name==='action_proposal').length,1);
  assert.equal(await ctx.swEval("chrome.storage.session.get('pending').then(s=>s.pending??null)"), null);
}
