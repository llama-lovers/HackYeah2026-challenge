export interface Proposal { action: string; target: string; text: string; needs_confirmation: boolean; say: string }
export interface ResolvedTarget { exists: boolean; epochMatches: boolean; connected: boolean; visible: boolean; disabled: boolean; role: string; sensitive: boolean; name: string; maxLength: number | null; submitsNonLookupForm: boolean }
export type RejectReason = 'unknown_action' | 'not_found' | 'stale' | 'hidden' | 'disabled' | 'role_mismatch' | 'sensitive_fill' | 'empty_text' | 'too_long' | 'needs_confirmation' | 'irreversible';
export type Verdict = { ok: true; kind: 'click' | 'fill' | 'none' } | { ok: false; reason: RejectReason };
export function validateProposal(_p: Proposal, _t: ResolvedTarget | null): Verdict { return { ok: true, kind: 'none' }; }
