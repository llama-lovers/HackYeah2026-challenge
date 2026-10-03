export type SnapKind = 'interactive' | 'heading' | 'text' | 'alert';
export interface SnapState { disabled?: true; checked?: boolean; expanded?: boolean; required?: true; invalid?: true; sensitive?: true }
export interface SnapNode { kind: SnapKind; id?: string; role: string; name: string; hint?: string; value?: string; href?: string; state?: SnapState }
export interface Snapshot { epoch: number; path: string; title: string; nodes: SnapNode[]; truncated: boolean }
export interface Transition { before: string; after: string }
export type ChangeWhat = 'disabled' | 'enabled' | 'value' | 'checked' | 'expanded' | 'invalid';
export interface DiffChange { role: string; name: string; what: ChangeWhat; to?: string }
export interface PageDiff { path?: Transition; title?: Transition; added: string[]; removed: string[]; changed: DiffChange[]; alerts: string[] }
export const MAX_NODES = 250, MAX_TEXT = 120, MAX_ALERT = 160;
export function collapse(s: string): string { return s; }
export function truncate(s: string, _max: number): string { return s; }
export function stripQuery(s: string): string { return s; }
export function spokenName(n: SnapNode): string { return n.name; }
export function toModelText(_s: Snapshot): string { return ''; }
