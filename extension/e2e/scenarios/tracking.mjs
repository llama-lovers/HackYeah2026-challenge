import assert from 'node:assert/strict';
export const name = 'tracking';
export const timeoutMs = 60000;
const digits = '873234987612340872938732';
const readback = 'Numer przesyłki: osiem siedem trzy dwa, trzy cztery dziewięć osiem, siedem sześć jeden dwa, trzy cztery zero osiem, siedem dwa dziewięć trzy, osiem siedem trzy dwa. Potwierdzasz? Powiedz tak albo nie.';
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  const mark = await ctx.upstreamMark();
  await ctx.speak(page, 'sprawdź status przesyłki numer 8732 3498 7612 3408 7293 8732');
  await ctx.waitForLive(page, readback); await ctx.waitIdle();
  assert.equal(await page.evaluate("document.querySelector('#ShipmentNumber').value"), '');
  assert.equal(await page.evaluate("document.querySelector('.track-parcel').textContent"), '');
  await ctx.speak(page, 'tak');
  await ctx.waitForLive(page, log => log.some(s => s.startsWith('Status na stronie: ')), 20000);
  const status = await page.evaluate(`(() => { const t=document.querySelector('.status h2').textContent.replace(/\\s+/g,' ').trim(), d=document.querySelector('.description').textContent.replace(/\\s+/g,' ').trim(); return 'Status na stronie: '+t+'. '+d; })()`);
  const log = await ctx.liveLog(page);
  assert(log.includes(status)); assert(status.includes('44051401359'));
  assert(log.indexOf('Wpisuję w pole Wpisz numer przesyłki.') < log.indexOf('Klikam Znajdź.'));
  assert(log.indexOf('Klikam Znajdź.') < log.indexOf(status));
  assert.equal(await page.evaluate("document.querySelector('#ShipmentNumber').value"), digits);
  assert.equal(await page.evaluate('location.search'), '?number=' + digits);
  assert.deepEqual(await ctx.upstreamSince(mark), []);
  assert(!log.some(s => s.startsWith('Zmiana na stronie')));
  assert.equal(await ctx.swEval("chrome.storage.session.get('pending').then(v => v.pending === undefined)"), true);
  await ctx.waitIdle();
}
