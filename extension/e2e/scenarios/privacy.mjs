import assert from 'node:assert/strict';
export const name = 'privacy';
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/sensitive.html');
  const mark = await ctx.upstreamMark();
  await ctx.speak(page, 'kliknij Zapłać');
  await ctx.waitForLive(page, 'Tej akcji nie wykonam bez potwierdzenia.');
  await ctx.waitIdle();
  const request = (await ctx.upstreamSince(mark)).find(r => r.response_format.json_schema.name === 'action_proposal');
  const content = request.messages.findLast(m => m.role === 'user').content;
  for (const secret of ['Tajne!Haslo1', '44051401359', 'PL61 1090 1014 0000 0712 1981 2874', '61109010140000071219812874', '4111 1111 1111 1111', '4111111111111111', '731904', 'value="846"']) assert(!content.includes(secret), `masked secret ${secret}`);
  // This invalid PESEL is a prefix of the required 24-digit positive control.
  // Require absence as a whole numeric token, just as the source masker does.
  assert.doesNotMatch(content, /(?<!\d)12345678901(?!\d)/);
  assert((content.match(/\[ukryte\]/g) ?? []).length >= 10);
  assert(content.includes('873234987612340872938732'));
  assert(content.includes('123456789012345678901234'));
  const output = ctx.proxyOutput();
  assert.match(output, /POST \/api\/action -> 200/);
  assert.match(output, /POST \/api\/transcribe -> 200/);
  for (const secret of ['kliknij', 'Zapłać', '[ukryte]', 'page_snapshot', '44051401359', '?text=']) assert(!output.includes(secret), `body-free proxy output ${secret}`);
}
