import { resolveTarget, getLastSnapshot } from './snapshot.ts';
import { candidateKind } from '../shared/validate.ts';
import { isCaptchaLabel } from '../shared/intent.ts';
import { spokenName } from '../shared/snapshot-format.ts';
import type { Snapshot } from '../shared/snapshot-format.ts';
import type { ExplorationCandidate } from '../shared/protocol.ts';
export const MAX_CANDIDATES = 40;
// Resolving a control re-walks parts of the DOM; a hostile or huge page must not stall the command.
export const PROJECTION_BUDGET_MS = 1500;
// One control, judged by the same live policy as the action executor. Nothing here can authorize an action.
function project(id: string, epoch: number): ExplorationCandidate | null {
  try {
    const { target, node } = resolveTarget(id, epoch);
    if (!target || !node || candidateKind(target) === null) return null;
    const name = spokenName(node);
    if (!name || isCaptchaLabel(node.name) || isCaptchaLabel(node.hint ?? '')) return null;
    return { id, role: target.role, name };
  } catch { return null; }
}
// Locally eligible, de-duplicated controls of a snapshot. `incomplete` means the list may be missing eligible controls.
export function projectCandidates(snapshot: Snapshot, budgetMs: number = PROJECTION_BUDGET_MS): { candidates: ExplorationCandidate[]; incomplete: boolean } {
  const started = performance.now(), seen = new Set<string>(), candidates: ExplorationCandidate[] = [];
  let incomplete = false;
  for (const node of snapshot.nodes) {
    if (node.kind !== 'interactive' || !node.id) continue;
    if (candidates.length >= MAX_CANDIDATES || performance.now() - started > budgetMs) { incomplete = true; break; }
    const candidate = project(node.id, snapshot.epoch);
    if (!candidate) continue;
    // The same role and name twice cannot be told apart by voice, so it is offered once.
    const key = candidate.role + '\u0000' + candidate.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return { candidates, incomplete };
}
// Re-judges suggested ids against the live page without taking a new snapshot (which would advance the epoch).
// Returns null when the snapshot the ids came from is no longer the current one.
export function recheckCandidates(epoch: number, ids: string[]): ExplorationCandidate[] | null {
  const last = getLastSnapshot();
  if (!last || last.epoch !== epoch) return null;
  const rechecked: ExplorationCandidate[] = [];
  for (const id of ids) { const candidate = project(id, epoch); if (candidate) rechecked.push(candidate); }
  return rechecked;
}
