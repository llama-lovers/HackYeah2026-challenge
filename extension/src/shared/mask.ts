export const MASK = '[ukryte]';
export interface FieldSignals { tag: string; type?: string; autocomplete?: string; name?: string; id?: string; label?: string; placeholder?: string; ariaLabel?: string }
const WEIGHTS = [1, 3, 7, 9, 1, 3, 7, 9, 1, 3];
export function isPesel(d: string): boolean {
  return /^\d{11}$/.test(d) && (10 - WEIGHTS.reduce((s, w, i) => s + w * +d[i]!, 0) % 10) % 10 === +d[10]!;
}
export function isLuhn(d: string): boolean {
  if (!/^\d{13,19}$/.test(d)) return false;
  let sum = 0, double = false;
  for (let i = d.length - 1; i >= 0; i--) {
    let digit = +d[i]!;
    if (double) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit; double = !double;
  }
  return sum % 10 === 0;
}
export function isNrb(d: string): boolean {
  if (!/^\d{26}$/.test(d)) return false;
  let remainder = 0;
  for (const digit of d.slice(2) + '2521' + d.slice(0, 2)) remainder = (remainder * 10 + +digit) % 97;
  return remainder === 1;
}
const RUN = /(?<!\d[ -]?)(?:\d[ -]?){7,29}\d(?![ -]?\d)/g;
const IBAN = /\bPL\s?\d{2}(?:\s?\d{4}){6}\b/gi;
export function maskText(t: string): string {
  return t.replace(IBAN, m => isNrb(m.replace(/\D/g, '')) ? MASK : m)
    .replace(RUN, m => {
      const digits = m.replace(/\D/g, '');
      return isPesel(digits) || isLuhn(digits) || isNrb(digits) ? MASK : m;
    });
}
export const SENSITIVE_AUTOCOMPLETE = new Set(['cc-number', 'cc-csc', 'cc-exp', 'cc-exp-month', 'cc-exp-year', 'one-time-code', 'current-password', 'new-password']);
export const SENSITIVE_FIELD_RE = /pesel|iban|nrb|numer konta|nr konta|rachunek|cvv|cvc|kart[ayę]|karcie|card|blik|kod sms|sms code|kod jednorazowy|one-time|otp|hasło|haslo|password|(?<![\p{L}\p{N}])pin(?![\p{L}\p{N}])/iu;
export function isSensitiveField(f: FieldSignals): boolean {
  return f.type?.toLowerCase() === 'password'
    || (f.autocomplete ?? '').toLowerCase().split(/\s+/).some(t => SENSITIVE_AUTOCOMPLETE.has(t))
    || [f.name, f.id, f.label, f.placeholder, f.ariaLabel].some(s => s !== undefined && SENSITIVE_FIELD_RE.test(s));
}
