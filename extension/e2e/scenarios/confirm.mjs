import assert from 'node:assert/strict';
export const name = 'confirm';
export const timeoutMs = 60000;
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/sensitive.html');
  const mark = await ctx.upstreamMark();
  await ctx.speak(page, 'kliknij Zapłać');
  await ctx.waitForLive(page, 'Chcę kliknąć „Zapłać”. Potwierdzasz? Powiedz tak albo nie.');
  await ctx.waitIdle();
  assert(!(await ctx.liveLog(page)).includes('Klikam Zapłać.'));
  assert.notEqual(await page.evaluate('window.__paid'), true);
  const requests = await ctx.upstreamSince(mark);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].response_format.json_schema.name, 'action_proposal');
  const replyMark = await ctx.upstreamMark();
  await ctx.speak(page, 'tak');
  await ctx.waitForLive(page, 'Klikam Zapłać.');
  await ctx.waitForLive(page, 'Kliknąłem Zapłać. Na stronie pojawiło się: Zapłacono.');
  await ctx.waitIdle();
  assert.equal(await page.evaluate('window.__payCount'), 1);
  assert.deepEqual(await ctx.upstreamSince(replyMark), []);
  assert.equal(await ctx.swEval("chrome.storage.session.get('pending').then(s => s.pending ?? null)"), null);
}
