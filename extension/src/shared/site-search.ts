import type { SnapNode, Snapshot } from './snapshot-format.ts';

const SEARCH_NAME = /^(?:szukaj|wyszukaj|wyszukiwanie|wyszukiwarka|search)(?:\s+(?:w|na|on|in)\s+youtube)?$/iu;
export function isSearchField(node: SnapNode): boolean {
  return ['textbox', 'searchbox', 'combobox'].includes(node.role) && !node.state?.sensitive
    && (node.role === 'searchbox' || SEARCH_NAME.test(node.name.trim()) || SEARCH_NAME.test(node.hint?.trim() ?? ''));
}
export function searchSubmitButton(snapshot: Snapshot): SnapNode | undefined {
  const candidates = snapshot.nodes.filter(node => node.role === 'button' && !node.state?.disabled && SEARCH_NAME.test(node.name.trim()));
  return candidates.length === 1 ? candidates[0] : undefined;
}
export function isYouTubePage(url: unknown): boolean {
  if (typeof url !== 'string') return false;
  try { const value = new URL(url); return value.protocol === 'https:' && ['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(value.hostname); }
  catch { return false; }
}
