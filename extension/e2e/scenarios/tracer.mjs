import assert from 'node:assert/strict';
import { waitFor } from '../cdp.mjs';
export const name = 'tracer';
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await page.evaluate(`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(document.querySelector('#ShipmentNumber'),'873234987612340872938732'); document.querySelector('#ShipmentNumber').dispatchEvent(new Event('input',{bubbles:true}));`);
  const focus = await page.evaluate('document.activeElement.tagName + document.activeElement.id');
  const mark = await ctx.upstreamMark();
  await ctx.speak(page, 'kliknij Znajdź');
  await ctx.waitForLive(page, 'Klikam Znajdź.');
  await waitFor(() => page.evaluate(`document.querySelector('.parcel-wrapper').textContent.includes('Status: W drodze do paczkomatu')`), { timeoutMs: 5000, label: 'real click result' });
  const log = await ctx.liveLog(page);
  assert(log.indexOf('Słucham.') < log.indexOf('Przetwarzam.') && log.indexOf('Przetwarzam.') < log.indexOf('Klikam Znajdź.'));
  const requests = await ctx.upstreamSince(mark);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].response_format.json_schema.name, 'action_proposal');
  const content = requests[0].messages.findLast(m => m.role === 'user').content;
  assert.match(content, /button e\d+ "Znajdź"/);
  assert.doesNotMatch(content, /button e\d+ "Szukaj"/);
  assert.deepEqual(await page.evaluate(`(() => {const h=document.getElementById('voice-agent-live-region'); return {lang:h.lang,tabStops:h.querySelectorAll('[tabindex]').length+(h.hasAttribute('tabindex')?1:0),focus:document.activeElement.tagName+document.activeElement.id};})()`), { lang: 'pl', tabStops: 0, focus });
  await ctx.waitIdle();
}
