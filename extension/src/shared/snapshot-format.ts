export type SnapKind = 'interactive' | 'heading' | 'text' | 'alert';
export interface SnapState { disabled?: true; checked?: boolean; expanded?: boolean; required?: true; invalid?: true; sensitive?: true }
export interface SnapNode { kind: SnapKind; id?: string; role: string; name: string; hint?: string; value?: string; href?: string; state?: SnapState }
export interface Snapshot { epoch: number; path: string; title: string; nodes: SnapNode[]; truncated: boolean }
export interface Transition { before: string; after: string }
export type ChangeWhat = 'disabled' | 'enabled' | 'value' | 'checked' | 'expanded' | 'invalid';
export interface DiffChange { role: string; name: string; what: ChangeWhat; to?: string }
export interface PageDiff { path?: Transition; title?: Transition; added: string[]; removed: string[]; changed: DiffChange[]; alerts: string[] }
export const MAX_NODES = 250, MAX_TEXT = 120, MAX_ALERT = 160;
export function collapse(s: string): string { return s.replace(/\s+/gu, ' ').trim(); }
export function truncate(s: string, max: number): string {
  const points = Array.from(collapse(s));
  if (max <= 0) return '';
  return points.length > max ? points.slice(0, max - 1).join('') + '…' : points.join('');
}
export function stripQuery(s: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(s)) return new URL(s).pathname;
  return s.split(/[?#]/, 1)[0] ?? '';
}
export function spokenName(n: SnapNode): string { return collapse(n.hint ?? '') || collapse(n.name); }
export function toModelText(s: Snapshot): string {
  const quoted = (v: string, max = MAX_TEXT) => `"${truncate(v, max).replace(/"/g, "'")}"`;
  const lines = [`path: ${collapse(s.path)}`, `title: ${truncate(s.title, MAX_TEXT)}`];
  for (const n of s.nodes) {
    if (n.kind !== 'interactive') { lines.push(`${n.kind} ${quoted(n.name, n.kind === 'alert' ? MAX_ALERT : MAX_TEXT)}`); continue; }
    let line = `${n.role} ${n.id} ${quoted(n.name)}`;
    if (collapse(n.hint ?? '') && collapse(n.hint!) !== collapse(n.name)) line += ` placeholder=${quoted(n.hint!)}`;
    if (n.value !== undefined) line += ` value=${quoted(n.value)}`;
    if (n.href !== undefined) line += ` href=${stripQuery(n.href)}`;
    if (n.state?.disabled) line += ' disabled';
    if (n.state?.checked !== undefined) line += n.state.checked ? ' checked' : ' unchecked';
    if (n.state?.expanded !== undefined) line += n.state.expanded ? ' expanded' : ' collapsed';
    for (const flag of ['required', 'invalid', 'sensitive'] as const) if (n.state?.[flag]) line += ` ${flag}`;
    lines.push(line);
  }
  if (s.truncated) lines.push('[snapshot truncated]');
  return lines.join('\n');
}
