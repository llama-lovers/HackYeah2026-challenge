export const MASK = '[ukryte]';
export interface FieldSignals { tag: string; type?: string; autocomplete?: string; name?: string; id?: string; label?: string; placeholder?: string; ariaLabel?: string }
export function maskText(t: string): string { return t; }
export function isPesel(_d: string): boolean { return false; }
export function isLuhn(_d: string): boolean { return false; }
export function isNrb(_d: string): boolean { return false; }
export function isSensitiveField(_f: FieldSignals): boolean { return false; }
