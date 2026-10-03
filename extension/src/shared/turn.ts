export type TurnPhase = 'idle' | 'recording' | 'processing';
// The wait clock starts once, when recording becomes processing, and ends at one absolute deadline. STT, model work and navigation never restart it.
export const WAIT_NOTICE_MS = 8000;
export interface TurnState {
  phase: TurnPhase; tabId?: number; startedAt: number; stubText?: string; id?: string;
  // Absolute epoch ms at which the "this takes longer than usual" notice is due; set once at the first processing transition.
  processingDeadline?: number;
  // Once-only claim: set (serialized) by whoever delivers the notice.
  waitNotifiedAt?: number;
  // Set (serialized) when the first line of the turn's answer is claimed; from then on the user is no longer in silence, so no late notice.
  outputClaimed?: boolean;
  // Set (serialized) when the transcript is accepted, so a duplicated or late STT event cannot start a second command or an extra error.
  commandStarted?: boolean;
}
export const STALE_MS = 30000;
export function isStale(s: TurnState, now: number): boolean { return s.phase !== 'idle' && now - s.startedAt > STALE_MS; }
// Recording -> processing. The deadline is kept when one already exists, so a repeated transition can never push it out.
export function toProcessing(state: TurnState, now: number): TurnState {
  return { ...state, phase: 'processing', startedAt: now, processingDeadline: state.processingDeadline ?? now + WAIT_NOTICE_MS };
}
export function onToggle(state: TurnState | undefined, tabId: number, now: number, id: string = crypto.randomUUID()): { next: TurnState; effect: 'start' | 'stop' | 'busy' } {
  if (!state || state.phase === 'idle' || isStale(state, now)) return { next: { phase: 'recording', tabId, startedAt: now, id }, effect: 'start' };
  // The processing deadline starts when recording stops, not when it started.
  if (state.phase === 'recording') return { next: toProcessing(state, now), effect: 'stop' };
  return { next: state, effect: 'busy' };
}
export type WaitDecision = { kind: 'drop' } | { kind: 'wait'; ms: number } | { kind: 'fire' };
// Pure fence for the wait notice: it is due only for the owning turn, still processing (and not abandoned as stale), not yet notified and with no answer line claimed.
export function waitDecision(state: TurnState | undefined, turnId: string, now: number): WaitDecision {
  if (!state || state.id !== turnId || state.phase !== 'processing' || state.processingDeadline === undefined || isStale(state, now)) return { kind: 'drop' };
  if (state.waitNotifiedAt !== undefined || state.outputClaimed === true) return { kind: 'drop' };
  return now < state.processingDeadline ? { kind: 'wait', ms: state.processingDeadline - now } : { kind: 'fire' };
}
