export interface Proposal { action: string; target: string; text: string; needs_confirmation: boolean; say: string; option_1?: string; option_2?: string; option_3?: string }
export interface ResolvedTarget { exists: boolean; epochMatches: boolean; connected: boolean; visible: boolean; disabled: boolean; role: string; sensitive: boolean; name: string; maxLength: number | null; submitsNonLookupForm: boolean; sideEffectSignals: boolean; knownSafe: boolean; drifted: boolean; consent: boolean }
export type RejectReason = 'unknown_action' | 'not_found' | 'stale' | 'hidden' | 'disabled' | 'role_mismatch' | 'sensitive_fill' | 'empty_text' | 'too_long' | 'needs_confirmation' | 'irreversible' | 'unconfirmed';
export type Verdict = { ok: true; kind: 'click' | 'fill' | 'none' } | { ok: false; reason: RejectReason };
export type ConfirmCategory = 'irreversible' | 'model_flag' | 'consent';
export function isConfirmable(reason: RejectReason): reason is 'needs_confirmation' | 'irreversible' { return reason === 'needs_confirmation' || reason === 'irreversible'; }
export const CLICK_ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'checkbox', 'radio']);
export const FILL_ROLES = new Set(['textbox', 'searchbox', 'combobox']);
// Payment, account-change and legal-consent signals that the verb list below misses (e.g. "Potwierdź płatność", "Zapisz zmiany").
export const SIDE_EFFECT_RE = /(?<![\p{L}\p{N}])(?:płatn\p{L}*|platn\p{L}*|zapłat\p{L}*|payment|checkout|zakup\p{L}*|zmian\p{L}*|zmień|zmien|dane\s+konta|regulamin\p{L}*|zgod\p{L}*|consent|potwierdź|potwierdz\p{L}*|confirm\p{L}*|zapisz|save|zatwierdz\p{L}*|wyloguj\p{L}*|logout|sign\s*out)(?![\p{L}\p{N}])/iu;
// Harmless disclosure/navigation wording for buttons outside forms ("Pokaż mapę", "Zamknij", "Pomoc").
export const BENIGN_UI_RE = /^(?:pokaż|pokaz|ukryj|rozwiń|rozwin|zwiń|zwin|więcej|wiecej|zamknij|mapa|menu|pomoc|szczegóły|szczegoly|show|hide|expand|collapse|more|close|help|details|map)(?:\s+\p{L}+){0,3}$/iu;
// A submit control counts as a lookup only when it positively names one.
export const LOOKUP_RE = /^(?:znajdź|znajdz|szukaj|sprawdź|sprawdz|śledź|sledz|search|find|track)(?:\s+\p{L}+){0,3}$/iu;
export const IRREVERSIBLE_NAME_RE = /(?<![\p{L}\p{N}])(?:zapłać|zaplac|płać|kup|kupuję|zamów|zamawiam|usuń|usun|wyślij|wyslij|zatwierdź|akceptuj|akceptuję|zgadzam|potwierdzam|subskrybuj|zapisz\s+się|pay|buy|order\s+now|delete|remove|send|submit|accept|agree|subscribe)(?![\p{L}\p{N}])/iu;
// Live target checks shared by action validation and exploration candidates; the order is part of the contract (more specific refusals later).
export function targetRejection(action: 'click' | 'fill', t: ResolvedTarget | null): RejectReason | null {
  if (t === null || !t.exists) return 'not_found';
  if (!t.epochMatches) return 'stale';
  if (!t.connected) return 'not_found';
  if (!t.visible) return 'hidden';
  if (t.disabled) return 'disabled';
  if (!(action === 'click' ? CLICK_ROLES : FILL_ROLES).has(t.role)) return 'role_mismatch';
  if (action === 'fill' && t.sensitive) return 'sensitive_fill';
  return null;
}
// A click that the policy would refuse without an explicit human confirmation.
export function clickNeedsConfirmation(t: ResolvedTarget): boolean {
  return IRREVERSIBLE_NAME_RE.test(t.name) || SIDE_EFFECT_RE.test(t.name) || t.submitsNonLookupForm || t.sideEffectSignals || t.consent || !t.knownSafe;
}
// Exploration eligibility: what the agent could execute right now without asking and without inventing fill text. Never an authorization.
export function candidateKind(t: ResolvedTarget | null): 'click' | 'fill' | null {
  if (t === null) return null;
  const action = CLICK_ROLES.has(t.role) ? 'click' : FILL_ROLES.has(t.role) ? 'fill' : null;
  if (!action || targetRejection(action, t) !== null || t.drifted) return null;
  if (action === 'click' && clickNeedsConfirmation(t)) return null;
  return action;
}
export function validateProposal(p: Proposal, t: ResolvedTarget | null, opts: { confirmed?: boolean } = {}): Verdict {
  const reject = (reason: RejectReason): Verdict => ({ ok: false, reason });
  if (!['click', 'fill', 'none'].includes(p.action)) return reject('unknown_action');
  if (p.action === 'none') return { ok: true, kind: 'none' };
  const rejection = targetRejection(p.action as 'click' | 'fill', t);
  if (rejection !== null) return reject(rejection);
  if (t === null) return reject('not_found');
  if (p.action === 'fill') {
    if (!p.text.trim()) return reject('empty_text');
    if (t.maxLength !== null && p.text.length > t.maxLength) return reject('too_long');
  }
  if (opts.confirmed !== true && p.needs_confirmation) return reject('needs_confirmation');
  if (opts.confirmed !== true && p.action === 'click' && clickNeedsConfirmation(t)) return reject('irreversible');
  // Checked last so a repurposed control is still refused for its own, more specific reason first.
  if (t.drifted) return reject('stale');
  return { ok: true, kind: p.action as 'click' | 'fill' };
}
