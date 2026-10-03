export function foldPolish(s: string): string { return s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/gi, 'l').toLowerCase(); }
export const DIGIT_WORDS = ['zero', 'jeden', 'dwa', 'trzy', 'cztery', 'pięć', 'sześć', 'siedem', 'osiem', 'dziewięć'] as const;
const units = new Map(DIGIT_WORDS.map((s, i) => [foldPolish(s), String(i)]));
units.set('jedna', '1'); units.set('jedno', '1'); units.set('dwie', '2');
const TEENS = ['dziesięć', 'jedenaście', 'dwanaście', 'trzynaście', 'czternaście', 'piętnaście', 'szesnaście', 'siedemnaście', 'osiemnaście', 'dziewiętnaście'];
const TENS = ['', '', 'dwadzieścia', 'trzydzieści', 'czterdzieści', 'pięćdziesiąt', 'sześćdziesiąt', 'siedemdziesiąt', 'osiemdziesiąt', 'dziewięćdziesiąt'];
const HUNDREDS = ['', 'sto', 'dwieście', 'trzysta', 'czterysta', 'pięćset', 'sześćset', 'siedemset', 'osiemset', 'dziewięćset'];
const teens = new Map(TEENS.map((s, i) => [foldPolish(s), i + 10]));
const tens = new Map(TENS.map((s, i) => [foldPolish(s), i * 10]).filter(([s]) => s !== '') as [string, number][]);
const hundreds = new Map(HUNDREDS.map((s, i) => [foldPolish(s), i * 100]).filter(([s]) => s !== '') as [string, number][]);
export function digitsToSpokenGroups(digits: string): string { return (digits.match(/.{1,4}/g) ?? []).map(group => Array.from(group, d => DIGIT_WORDS[Number(d)]).join(' ')).join(', '); }
export function wordsToDigits(text: string): { ok: true; digits: string } | { ok: false } {
  let digits = '';
  const tokens = foldPolish(text).split(/[\s\-.,/]+/u).filter(Boolean);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (['numer', 'numerze', 'nr', 'o', 'to', 'jest'].includes(token)) continue;
    if (/^\d+$/.test(token)) digits += token;
    else if (hundreds.has(token) || teens.has(token) || tens.has(token)) {
      let value = 0, width = 2;
      if (hundreds.has(token)) { value = hundreds.get(token)!; width = 3; i++; }
      const next = tokens[i] ?? '';
      if (teens.has(next)) value += teens.get(next)!;
      else if (tens.has(next)) {
        value += tens.get(next)!;
        if (units.has(tokens[i + 1] ?? '')) value += Number(units.get(tokens[++i]!));
      } else if (width === 3 && units.has(next)) value += Number(units.get(next));
      else i--;
      digits += String(value).padStart(width, '0');
    } else if (units.has(token)) digits += units.get(token);
    else return { ok: false };
  }
  return { ok: true, digits };
}
export function pluralForm(n: number, one: string, few: string, many: string): string { return n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? few : many; }
function belowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(HUNDREDS[Math.floor(n / 100)]!); n %= 100; }
  if (n >= 10 && n < 20) parts.push(TEENS[n - 10]!);
  else { if (n >= 20) parts.push(TENS[Math.floor(n / 10)]!); if (n % 10) parts.push(DIGIT_WORDS[n % 10]!); }
  return parts.join(' ');
}
export function spellInteger(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999999999) throw new RangeError('invalid_integer');
  if (n === 0) return DIGIT_WORDS[0];
  const parts: string[] = [];
  for (const [scale, one, few, many] of [[1000000, 'milion', 'miliony', 'milionów'], [1000, 'tysiąc', 'tysiące', 'tysięcy']] as const) {
    const count = Math.floor(n / scale);
    if (count) { parts.push(count === 1 ? one : belowThousand(count) + ' ' + pluralForm(count, one, few, many)); n %= scale; }
  }
  if (n) parts.push(belowThousand(n));
  return parts.join(' ');
}
export function formatPln(zl: number, gr = 0): string {
  if (!Number.isInteger(gr) || gr < 0 || gr > 99) throw new RangeError('invalid_grosz');
  const parts: string[] = [];
  if (zl || !gr) parts.push(spellInteger(zl) + ' ' + pluralForm(zl, 'złoty', 'złote', 'złotych'));
  if (gr) parts.push(spellInteger(gr) + ' ' + pluralForm(gr, 'grosz', 'grosze', 'groszy'));
  return parts.join(' ');
}
const ORDINALS = ['', 'pierwszego', 'drugiego', 'trzeciego', 'czwartego', 'piątego', 'szóstego', 'siódmego', 'ósmego', 'dziewiątego', 'dziesiątego', 'jedenastego', 'dwunastego', 'trzynastego', 'czternastego', 'piętnastego', 'szesnastego', 'siedemnastego', 'osiemnastego', 'dziewiętnastego'];
const ORDINAL_TENS = ['', '', 'dwudziestego', 'trzydziestego', 'czterdziestego', 'pięćdziesiątego', 'sześćdziesiątego', 'siedemdziesiątego', 'osiemdziesiątego', 'dziewięćdziesiątego'];
const MONTHS = ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia'];
function ordinal(n: number): string { return n < 20 ? ORDINALS[n]! : ORDINAL_TENS[Math.floor(n / 10)]! + (n % 10 ? ' ' + ORDINALS[n % 10] : ''); }
function validDate(d: number, m: number, y: number): boolean {
  return Number.isInteger(d) && Number.isInteger(m) && Number.isInteger(y) && y >= 2000 && y <= 2099 && m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}
export function formatDate(d: number, m: number, y: number): string {
  if (!validDate(d, m, y)) return '';
  return ordinal(d) + ' ' + MONTHS[m - 1] + ' ' + (y === 2000 ? 'dwutysięcznego' : 'dwa tysiące ' + ordinal(y % 100)) + ' roku';
}
export function speakable(text: string): string {
  const date = (original: string, d: string, m: string, y: string) => formatDate(Number(d), Number(m), Number(y)) || original;
  let result = text.replace(/(?<!\d)(\d{1,2})\.(\d{1,2})\.(\d{4})(?!\d)/gu, (all, d, m, y) => date(all, d, m, y));
  result = result.replace(/(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/gu, (all, y, m, d) => date(all, d, m, y));
  const monthPattern = MONTHS.join('|');
  result = result.replace(new RegExp('(?<!\\d)(\\d{1,2})\\s+(' + monthPattern + ')\\s+(\\d{4})(?!\\d)(?:\\s+r\\.)?', 'giu'), (all, d, month, y) => formatDate(Number(d), MONTHS.indexOf(month.toLowerCase()) + 1, Number(y)) || all);
  result = result.replace(/(?<![\p{L}\p{N},])((?:\d{1,3}(?:[ \u00a0]\d{3})+|\d+))(?:,(\d{2}))?\s*(?:PLN|złotych|zł)(?!\p{L})/giu, (all, zl, gr) => {
    const integer = Number(zl.replace(/[ \u00a0]/g, ''));
    return integer <= 999999999 ? formatPln(integer, Number(gr ?? 0)) : all;
  });
  return result.replace(/(?<![\p{L}\p{N}])(\d{24}|\d{8})(?![\p{L}\p{N}])/gu, (_all, digits: string) => digitsToSpokenGroups(digits));
}
