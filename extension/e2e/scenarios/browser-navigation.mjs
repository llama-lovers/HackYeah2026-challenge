import assert from 'node:assert/strict';
import { attach, evaluate, waitFor, waitForTarget } from '../cdp.mjs';

export const name = 'browser-navigation';
export const timeoutMs = 40000;
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  const mark = await ctx.upstreamMark();
  await ctx.speak(page, `przejdź na ${ctx.proxyOrigin}/fixtures/szukaj.html`);
  await waitFor(() => page.evaluate("location.pathname === '/fixtures/szukaj.html'"), { label: 'spoken address navigation' });
  await ctx.waitIdle();

  // Open a different origin to prove this does not depend on a link in the DOM.
  await ctx.speak(page, 'otwórz http://127.0.0.1:8788/fixtures/tracking-form.html w nowej karcie');
  const created = await waitForTarget(ctx.browser.port, t => t.type === 'page' && t.url === 'http://127.0.0.1:8788/fixtures/tracking-form.html');
  assert.equal(await page.evaluate('location.pathname'), '/fixtures/szukaj.html');
  await ctx.waitIdle();
  await ctx.client.send('Target.closeTarget', { targetId: created.id });
  await ctx.client.send('Page.bringToFront', {}, page.sessionId);

  await ctx.speak(page, 'otwórz nową kartę');
  const blank = await waitForTarget(ctx.browser.port, t => t.type === 'page' && /^(?:chrome|edge):\/\/newtab\/?$/.test(t.url));
  await ctx.waitIdle();
  const blankSession = await attach(ctx.client, blank.id);
  await ctx.client.send('Page.bringToFront', {}, blankSession);
  // No content script is allowed in chrome://newtab. The next spoken address
  // still records and uses TTS, then navigates that same tab to an ordinary page.
  await ctx.toggle({ stubText: `przejdź na ${ctx.proxyOrigin}/fixtures/szukaj.html` });
  await waitFor(async () => (await ctx.turnState()).phase === 'recording', { label: 'blank tab voice recording' });
  await new Promise(resolve => setTimeout(resolve, 800));
  await ctx.toggle();
  await waitFor(() => evaluate(ctx.client, blankSession, "location.pathname === '/fixtures/szukaj.html'"), { label: 'navigation from blank tab' });
  await ctx.waitIdle();
  assert.deepEqual(await ctx.upstreamSince(mark), [], 'URL commands must not call the action/effect model');
}
