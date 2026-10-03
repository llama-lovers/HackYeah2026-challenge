export interface Proposal { action: string; target: string; text: string; needs_confirmation: boolean; say: string }
export interface ResolvedTarget { exists: boolean; epochMatches: boolean; connected: boolean; visible: boolean; disabled: boolean; role: string; sensitive: boolean; name: string; maxLength: number | null; submitsNonLookupForm: boolean; sideEffectSignals: boolean; knownSafe: boolean }
export type RejectReason = 'unknown_action' | 'not_found' | 'stale' | 'hidden' | 'disabled' | 'role_mismatch' | 'sensitive_fill' | 'empty_text' | 'too_long' | 'needs_confirmation' | 'irreversible';
export type Verdict = { ok: true; kind: 'click' | 'fill' | 'none' } | { ok: false; reason: RejectReason };
export const CLICK_ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio']);
export const FILL_ROLES = new Set(['textbox', 'searchbox', 'combobox']);
// Payment, account-change and legal-consent signals that the verb list below misses (e.g. "Potwierdź płatność", "Zapisz zmiany").
export const SIDE_EFFECT_RE = /(?<![\p{L}\p{N}])(?:płatn\p{L}*|platn\p{L}*|zapłat\p{L}*|payment|checkout|zakup\p{L}*|zmian\p{L}*|zmień|zmien|dane\s+konta|regulamin\p{L}*|zgod\p{L}*|consent|potwierdź|potwierdz\p{L}*|confirm\p{L}*|zapisz|save|zatwierdz\p{L}*|wyloguj\p{L}*|logout|sign\s*out)(?![\p{L}\p{N}])/iu;
// Harmless disclosure/navigation wording for buttons outside forms ("Pokaż mapę", "Zamknij", "Pomoc").
export const BENIGN_UI_RE = /^(?:pokaż|pokaz|ukryj|rozwiń|rozwin|zwiń|zwin|więcej|wiecej|zamknij|mapa|menu|pomoc|szczegóły|szczegoly|show|hide|expand|collapse|more|close|help|details|map)(?:\s+\p{L}+){0,3}$/iu;
// A submit control counts as a lookup only when it positively names one.
export const LOOKUP_RE = /^(?:znajdź|znajdz|szukaj|sprawdź|sprawdz|śledź|sledz|search|find|track)(?:\s+\p{L}+){0,3}$/iu;
export const IRREVERSIBLE_NAME_RE = /(?<![\p{L}\p{N}])(?:zapłać|zaplac|płać|kup|kupuję|zamów|zamawiam|usuń|usun|wyślij|wyslij|zatwierdź|akceptuj|akceptuję|zgadzam|potwierdzam|subskrybuj|zapisz\s+się|pay|buy|order\s+now|delete|remove|send|submit|accept|agree|subscribe)(?![\p{L}\p{N}])/iu;
export function validateProposal(p: Proposal, t: ResolvedTarget | null): Verdict {
  const reject = (reason: RejectReason): Verdict => ({ ok: false, reason });
  if (!['click', 'fill', 'none'].includes(p.action)) return reject('unknown_action');
  if (p.action === 'none') return { ok: true, kind: 'none' };
  if (t === null || !t.exists) return reject('not_found');
  if (!t.epochMatches) return reject('stale');
  if (!t.connected) return reject('not_found');
  if (!t.visible) return reject('hidden');
  if (t.disabled) return reject('disabled');
  if (!(p.action === 'click' ? CLICK_ROLES : FILL_ROLES).has(t.role)) return reject('role_mismatch');
  if (p.action === 'fill') {
    if (t.sensitive) return reject('sensitive_fill');
    if (!p.text.trim()) return reject('empty_text');
    if (t.maxLength !== null && p.text.length > t.maxLength) return reject('too_long');
  }
  if (p.needs_confirmation) return reject('needs_confirmation');
  if (p.action === 'click' && (IRREVERSIBLE_NAME_RE.test(t.name) || SIDE_EFFECT_RE.test(t.name) || t.submitsNonLookupForm || t.sideEffectSignals || !t.knownSafe)) return reject('irreversible');
  return { ok: true, kind: p.action as 'click' | 'fill' };
}
