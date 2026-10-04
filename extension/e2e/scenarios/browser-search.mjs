import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { attach, evaluate, waitFor, waitForTarget, REPO_ROOT } from '../cdp.mjs';

export const name = 'browser-search';
export const timeoutMs = 35000;
export async function run(ctx) {
  const original = await ctx.openPage('/fixtures/tracking-form.html');
  const mark = await ctx.upstreamMark();
  await ctx.speak(original, 'otwórz mi nową zakładkę proszę');
  const blank = await waitForTarget(ctx.browser.port, t => t.type === 'page' && /^(?:chrome|edge):\/\/newtab\/?$/.test(t.url));
  const session = await attach(ctx.client, blank.id);
  await ctx.waitIdle();
  await ctx.swEval(`(() => {
    globalThis.__searchUpdates=[];
    const update=chrome.tabs.update.bind(chrome.tabs);
    chrome.tabs.update=async (id, options) => { globalThis.__searchUpdates.push(options); return update(id, options); };
  })()`);
  await ctx.client.send('Page.bringToFront', {}, session);
  await ctx.toggle({ stubText: 'wpisz paczkomaty w Warszawie w pole wyszukiwania' });
  await waitFor(async () => (await ctx.turnState()).phase === 'recording', { label: 'start-page recording after reload' });
  await new Promise(resolve => setTimeout(resolve, 800));
  await ctx.toggle();
  await waitFor(async () => {
    const updates = await ctx.swEval('globalThis.__searchUpdates');
    return updates.some(update => {
      const url = new URL(update.url);
      return url.hostname === 'www.google.com' && url.pathname === '/search' && url.searchParams.get('q') === 'paczkomaty w Warszawie';
    });
  }, { label: 'Google search with exact spoken query' });
  // Google can redirect immediately to /sorry/ (CAPTCHA); do not mistake that
  // for failure to dispatch the correct search URL from the extension.
  await waitFor(() => evaluate(ctx.client, session, "location.hostname === 'www.google.com' && ['/search', '/sorry/index'].includes(location.pathname)"), { label: 'Google navigation committed' });
  await waitFor(() => evaluate(ctx.client, session, "document.readyState === 'complete' && document.body.innerText.trim().length > 30"), { timeoutMs: 15000, label: 'search page loaded' });
  await ctx.waitIdle();
  assert.equal(await original.evaluate('location.pathname'), '/fixtures/tracking-form.html');
  assert.deepEqual(await ctx.upstreamSince(mark), []);
  const dir = resolve(REPO_ROOT, 'test-artifacts/browser-search');
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, 'result.json'), JSON.stringify({
    status: 'PASS_NAVIGATION', query: 'paczkomaty w Warszawie',
    requestedUrl: 'https://www.google.com/search?q=paczkomaty+w+Warszawie',
    pageKind: await evaluate(ctx.client, session, "location.pathname.startsWith('/sorry/') ? 'captcha' : 'search_page'"),
    url: await evaluate(ctx.client, session, 'location.href'),
    title: await evaluate(ctx.client, session, 'document.title'),
    pageText: await evaluate(ctx.client, session, 'document.body.innerText.slice(0, 1200)'),
    scope: 'Real browser + virtual microphone; STT stub; exact search navigation, not ranking or availability of Google results',
  }, null, 2));
  const screenshot = await ctx.client.send('Page.captureScreenshot', { format: 'png' }, session);
  await writeFile(resolve(dir, 'after.png'), Buffer.from(screenshot.data, 'base64'));
}
