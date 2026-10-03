import { collapse, truncate } from './snapshot-format.ts';
import type { Snapshot, PageDiff, SnapNode, DiffChange } from './snapshot-format.ts';
const cap = (s: string) => truncate(s, 160);
function controls(s: Snapshot): Map<string, SnapNode> {
  const counts = new Map<string, number>(), result = new Map<string, SnapNode>();
  for (const n of s.nodes.filter(n => n.kind === 'interactive')) {
    const key = JSON.stringify([n.role, collapse(n.name)]), ordinal = counts.get(key) ?? 0;
    counts.set(key, ordinal + 1); result.set(JSON.stringify([key, ordinal]), n);
  }
  return result;
}
function surplus(before: SnapNode[], after: SnapNode[]): string[] {
  const counts = new Map<string, number>();
  for (const n of before) { const key = collapse(n.name); counts.set(key, (counts.get(key) ?? 0) + 1); }
  const result: string[] = [];
  for (const n of after) {
    const key = collapse(n.name), count = counts.get(key) ?? 0;
    if (count) counts.set(key, count - 1); else if (key) result.push(cap(key));
  }
  return result;
}
export function diffSnapshots(before: Snapshot, after: Snapshot): PageDiff {
  const d: PageDiff = { added: [], removed: [], changed: [], alerts: [] };
  if (before.path !== after.path) d.path = { before: cap(before.path), after: cap(after.path) };
  if (before.title !== after.title) d.title = { before: cap(before.title), after: cap(after.title) };
  const old = controls(before), current = controls(after);
  for (const [key, n] of current) {
    const prev = old.get(key);
    if (!prev) { d.added.push(cap(`${n.role} ${n.name}`)); continue; }
    const push = (what: DiffChange['what'], to?: string) => d.changed.push({ role: cap(n.role), name: cap(n.name), what, ...(to === undefined ? {} : { to: cap(to) }) });
    if (!!prev.state?.disabled !== !!n.state?.disabled) push(n.state?.disabled ? 'disabled' : 'enabled');
    if (prev.value !== n.value) push('value', n.value ?? '');
    for (const what of ['checked', 'expanded', 'invalid'] as const) {
      if (!!prev.state?.[what] !== !!n.state?.[what]) push(what, String(!!n.state?.[what]));
    }
  }
  for (const [key, n] of old) if (!current.has(key)) d.removed.push(cap(`${n.role} ${n.name}`));
  const text = (s: Snapshot) => s.nodes.filter(n => n.kind === 'text' || n.kind === 'heading');
  const alerts = (s: Snapshot) => s.nodes.filter(n => n.kind === 'alert');
  d.added.push(...surplus(text(before), text(after)));
  d.removed.push(...surplus(text(after), text(before)), ...surplus(alerts(after), alerts(before)));
  d.alerts = surplus(alerts(before), alerts(after)).slice(0, 3);
  d.added = d.added.slice(0, 8); d.removed = d.removed.slice(0, 5); d.changed = d.changed.slice(0, 8);
  return d;
}
export function isEmptyDiff(d: PageDiff): boolean { return !d.path && !d.title && !d.added.length && !d.removed.length && !d.changed.length && !d.alerts.length; }
