import type { Snapshot, SnapNode } from './snapshot-format.ts';
import { foldPolish } from './polish-speech.ts';
import { LOOKUP_RE } from './validate.ts';
export const PARCEL_RE = /^(?:\d{8}|\d{24})$/;
export function isParcelDigits(d: string): boolean { return typeof d === 'string' && PARCEL_RE.test(d); }
export function pickParcelField(s: Snapshot): SnapNode | null { return s.nodes.find(n => n.kind === 'interactive' && ['textbox', 'searchbox'].includes(n.role) && !n.state?.disabled && !n.state?.sensitive && /przesyl|parcel/.test(foldPolish(n.name + ' ' + (n.hint ?? '')))) ?? null; }
export function pickSearchButton(s: Snapshot): SnapNode | null {
  const buttons = s.nodes.filter(n => n.kind === 'interactive' && n.role === 'button' && !n.state?.disabled);
  return buttons.find(n => foldPolish(n.name).trim() === 'znajdz') ?? buttons.find(n => LOOKUP_RE.test(n.name)) ?? null;
}
