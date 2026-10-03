export function foldPolish(s: string): string { return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/gi, 'l').toLowerCase(); }
export const DIGIT_WORDS = ['zero', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'] as const;
const units = new Map(DIGIT_WORDS.map((s, i) => [foldPolish(s), String(i)]));
units.set('jedna', '1'); units.set('jedno', '1'); units.set('dwie', '2');
export function digitsToSpokenGroups(digits: string): string { return (digits.match(/.{1,4}/g) ?? []).map(group => Array.from(group, d => DIGIT_WORDS[Number(d)]).join(' ')).join(', '); }
export function wordsToDigits(text: string): { ok: true; digits: string } | { ok: false } {
  let digits = '';
  for (const token of foldPolish(text).split(/[\s\-.,/]+/u).filter(Boolean)) {
    if (['numer', 'numerze', 'nr', 'o', 'to', 'jest'].includes(token)) continue;
    if (/^\d+$/.test(token)) digits += token;
    else if (units.has(token)) digits += units.get(token);
    else return { ok: false };
  }
  return { ok: true, digits };
}
