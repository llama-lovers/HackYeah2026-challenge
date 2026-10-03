import assert from 'node:assert/strict';
import { waitFor } from '../cdp.mjs';
export const name = 'navigation';
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  const mark = await ctx.upstreamMark();
  // Preserve pre-navigation evidence in sessionStorage of the fixture's main world.
  await page.evaluate(`sessionStorage.removeItem('navigationPre'); addEventListener('beforeunload', () => sessionStorage.setItem('navigationLog', JSON.stringify(window.__liveLog))); new MutationObserver(() => { if(window.__liveLog?.includes('Klikam Szukaj.')) sessionStorage.setItem('navigationPre', 'Klikam Szukaj.'); }).observe(document, {subtree:true,childList:true,characterData:true});`);
  await ctx.speak(page, 'kliknij Szukaj');
  await waitFor(() => page.evaluate("location.pathname === '/fixtures/szukaj.html'"), { label: 'search navigation' });
  assert.equal(await page.evaluate("sessionStorage.getItem('navigationPre')"), 'Klikam Szukaj.', 'pre-unload live log: ' + await page.evaluate("sessionStorage.getItem('navigationLog')"));
  await ctx.waitForLive(page, log => log.some(s => s.startsWith('Zmiana na stronie')), 10000);
  await ctx.waitIdle();
  const requests = await ctx.upstreamSince(mark);
  const action = requests.find(r => r.response_format.json_schema.name === 'action_proposal').messages.findLast(m => m.role === 'user').content;
  const searchLines = action.split('\n').filter(line => /"Szukaj"/.test(line));
  assert.equal(searchLines.length, 1); assert.match(searchLines[0], /^link /);
  const effects = requests.filter(r => r.response_format.json_schema.name === 'effect_summary');
  assert.equal(effects.length, 1);
  assert.match(effects[0].messages.findLast(m => m.role === 'user').content, /\/fixtures\/szukaj.html/);
  assert.equal(await ctx.swEval("chrome.storage.session.get('pendingEffect').then(s => s.pendingEffect ?? null)"), null);
  assert.equal((await ctx.liveLog(page)).filter(s => s.startsWith('Zmiana na stronie')).length, 1);
  // The READY replay on an expired job is silent and leaves no job or processing turn.
  const staleMark = await ctx.upstreamMark();
  await ctx.swEval(`(() => chrome.tabs.query({active:true,lastFocusedWindow:true}).then(([tab]) => chrome.storage.session.set({turn:{phase:'processing',tabId:tab.id,startedAt:Date.now(),id:'stale-job'},pendingEffect:{id:crypto.randomUUID(),turnId:'stale-job',state:'executed',tabId:tab.id,action:{kind:'click',name:'Szukaj',role:'link'},preSnapshot:{epoch:1,path:'/fixtures/tracking-form.html',title:'Tracking',nodes:[],truncated:false},startedAt:Date.now()-20000}})))()`);
  await ctx.client.send('Page.reload', {}, page.sessionId);
  await new Promise(resolve => setTimeout(resolve, 3000));
  assert(!(await ctx.liveLog(page)).some(s => s.startsWith('Zmiana na stronie')));
  assert.equal(await ctx.swEval("chrome.storage.session.get('pendingEffect').then(s => s.pendingEffect ?? null)"), null);
  assert.equal((await ctx.upstreamSince(staleMark)).filter(r => r.response_format.json_schema.name === 'effect_summary').length, 0);
  await ctx.waitIdle();
}
