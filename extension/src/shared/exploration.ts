import { foldPolish, speakable } from './polish-speech.ts';
import type { ExplorationMode, ExplorationResponse, ExplorationCandidate, Verbosity } from './protocol.ts';
export type ExploreCommand = ExplorationMode;
export const MAX_SUMMARY_SENTENCES = 2;
export const MAX_SENTENCE_CHARS = 300;
const SUMMARY_PHRASES = new Set(['co tu jest', 'co tutaj jest', 'co jest na tej stronie', 'co jest na stronie', 'co to za strona', 'co to jest za strona']);
const ACTIONS_PHRASES = new Set(['co moge zrobic', 'co moge tu zrobic', 'co moge tutaj zrobic', 'co moge zrobic na tej stronie', 'co moge zrobic na stronie', 'co jeszcze moge zrobic', 'jakie sa dostepne akcje', 'jakie mam mozliwosci']);
// Whole-phrase match only: a longer utterance that merely contains these words is left to the action route.
export function parseExploreCommand(text: string): ExploreCommand | null {
  const s = foldPolish(text).replace(/[.,!?;:"'„”]/gu, ' ').replace(/\s+/gu, ' ').trim();
  return SUMMARY_PHRASES.has(s) ? 'summary' : ACTIONS_PHRASES.has(s) ? 'actions' : null;
}
// Runtime decoding of a proxy success body: a typed fetch proves nothing about the JSON, so shape and bounds are checked here.
function decodeExploration(value: unknown): ExplorationResponse | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const keys = Object.keys(v);
  if (keys.length !== 2 || !keys.includes('sentences') || !keys.includes('candidate_ids')) return null;
  if (!Array.isArray(v.sentences) || !Array.isArray(v.candidate_ids)) return null;
  if (!v.sentences.every(s => typeof s === 'string') || !v.candidate_ids.every(id => typeof id === 'string')) return null;
  return { sentences: v.sentences as string[], candidate_ids: v.candidate_ids as string[] };
}
// One or two complete sentences, nothing else; empty, null, extra-field, excessive or cut-off output is rejected, never sliced.
export function decodeSummary(value: unknown): string[] | null {
  const decoded = decodeExploration(value);
  if (!decoded || decoded.candidate_ids.length) return null;
  const sentences = decoded.sentences.map(s => s.trim());
  if (sentences.length < 1 || sentences.length > MAX_SUMMARY_SENTENCES) return null;
  if (!sentences.every(s => s.length > 0 && Array.from(s).length <= MAX_SENTENCE_CHARS && !/[\r\n]/u.test(s) && /[.!?…]$/u.test(s))) return null;
  return sentences.map(speakable);
}
// Same tier caps as the proxy; the standard tier lies inside the required three to five.
export const ACTION_CAPS: Record<Verbosity, number> = { concise: 3, standard: 4, detailed: 5 };
// Suggestions must be a non-empty, unique subset of the ids that were offered, within the tier cap. Anything else is rejected whole.
export function decodeActions(value: unknown, offered: readonly string[], cap: number): string[] | null {
  const decoded = decodeExploration(value);
  if (!decoded || decoded.sentences.length) return null;
  const ids = decoded.candidate_ids;
  if (ids.length === 0 || ids.length > cap || new Set(ids).size !== ids.length) return null;
  const known = new Set(offered);
  return ids.every(id => known.has(id)) ? ids : null;
}
// The recheck reply comes from the content script but is still decoded: only candidates that were suggested may come back, once each.
export function decodeRecheck(value: unknown, suggested: readonly string[]): ExplorationCandidate[] | 'stale' | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.ok === false) return v.reason === 'stale' ? 'stale' : null;
  if (v.ok !== true || !Array.isArray(v.candidates)) return null;
  const allowed = new Set(suggested), seen = new Set<string>(), out: ExplorationCandidate[] = [];
  for (const item of v.candidates) {
    if (typeof item !== 'object' || item === null) return null;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== 'string' || typeof c.role !== 'string' || typeof c.name !== 'string' || !allowed.has(c.id) || seen.has(c.id)) return null;
    seen.add(c.id); out.push({ id: c.id, role: c.role, name: c.name });
  }
  return out;
}
