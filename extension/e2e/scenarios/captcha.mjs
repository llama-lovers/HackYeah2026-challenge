import assert from 'node:assert/strict';
export const name = 'captcha';
export const timeoutMs = 60000;
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  const captchaMark = await ctx.upstreamMark();
  await ctx.speak(page,'zaznacz, że nie jestem robotem'); await ctx.waitForLive(page,'Nie rozwiązuję zabezpieczeń captcha. Poproś o pomoc zaufaną osobę.'); await ctx.waitIdle();
  assert.deepEqual(await ctx.upstreamSince(captchaMark),[]);
  await ctx.speak(page,'sprawdź status przesyłki numer 1111 1111 1111 1111 1111 1111');
  await ctx.waitForLive(page,'Numer przesyłki: jeden jeden jeden jeden, jeden jeden jeden jeden, jeden jeden jeden jeden, jeden jeden jeden jeden, jeden jeden jeden jeden, jeden jeden jeden jeden. Potwierdzasz? Powiedz tak albo nie.'); await ctx.waitIdle();
  await ctx.speak(page,'tak'); await ctx.waitForLive(page,'Wpisuję w pole Wpisz numer przesyłki.'); await ctx.waitForLive(page,'Klikam Znajdź.');
  await ctx.waitForLive(page,'Strona pokazuje zabezpieczenie captcha. Nie rozwiązuję go. Poproś o pomoc zaufaną osobę.',20000); await ctx.waitIdle();
  assert.deepEqual(await ctx.upstreamSince(captchaMark),[]);
}
