import assert from 'node:assert/strict';
import { waitFor } from '../cdp.mjs';
export const name = 'effect';
export const timeoutMs = 45000;
const userContent = request => request.messages.findLast(m => m.role === 'user').content;
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  let mark = await ctx.upstreamMark();
  await ctx.speak(page, 'wpisz 873234987612340872938732 w pole numeru przesyłki');
  await ctx.waitForLive(page, log => log.some(s => s.startsWith('Zmiana na stronie')));
  await ctx.waitIdle();
  let log = await ctx.liveLog(page);
  assert(log.indexOf('Wpisuję w pole Wpisz numer przesyłki.') < log.findIndex(s => s.startsWith('Zmiana na stronie')));
  assert.equal(await page.evaluate("document.querySelector('#ShipmentNumber').value"), '873234987612340872938732');
  let requests = await ctx.upstreamSince(mark);
  assert.match(userContent(requests.find(r => r.response_format.json_schema.name === 'action_proposal')), /873234987612340872938732/);
  let effect = requests.find(r => r.response_format.json_schema.name === 'effect_summary');
  assert.match(userContent(effect), /<page_diff>/); assert.doesNotMatch(userContent(effect), /<page_snapshot>/);
  let offset = log.length;
  mark = await ctx.upstreamMark();
  await ctx.speak(page, 'kliknij Znajdź');
  await ctx.waitForLive(page, log => log.slice(offset).includes('Klikam Znajdź.'));
  const preAt = Date.now();
  await ctx.waitForLive(page, log => log.slice(offset).some(s => s.startsWith('Zmiana na stronie')));
  assert(Date.now() - preAt < 3800, 'settle must ignore SVG churn');
  await ctx.waitIdle();
  requests = await ctx.upstreamSince(mark);
  effect = requests.find(r => r.response_format.json_schema.name === 'effect_summary');
  assert.match(userContent(effect), /W drodze do paczkomatu/);
  offset = (await ctx.liveLog(page)).length;
  mark = await ctx.upstreamMark();
  await ctx.speak(page, 'kliknij Pokaż mapę');
  await ctx.waitForLive(page, log => log.slice(offset).includes('Kliknąłem Pokaż mapę, ale na stronie nic się nie zmieniło.'));
  await ctx.waitIdle();
  log = (await ctx.liveLog(page)).slice(offset);
  assert(log.indexOf('Klikam Pokaż mapę.') < log.indexOf('Kliknąłem Pokaż mapę, ale na stronie nic się nie zmieniło.'));
  assert.equal((await ctx.upstreamSince(mark)).filter(r => r.response_format.json_schema.name === 'effect_summary').length, 0);
  // A changed page with a failed effect call still gets the fixed Polish fallback.
  await ctx.swEval(`globalThis.__realFetch = fetch; globalThis.fetch = (url, opts) => String(url).endsWith('/api/effect') ? Promise.reject(new Error('fixture_failure')) : __realFetch(url, opts);`);
  try {
    offset = (await ctx.liveLog(page)).length;
    await ctx.speak(page, 'wpisz 123456789012345678901234 w pole numeru przesyłki');
    await ctx.waitForLive(page, log => log.slice(offset).includes('Wpisałem tekst w pole Wpisz numer przesyłki. Strona się zmieniła, ale nie udało mi się jej opisać.'));
    await ctx.waitIdle();
  } finally { await ctx.swEval('globalThis.fetch = __realFetch; delete globalThis.__realFetch;'); }
}
