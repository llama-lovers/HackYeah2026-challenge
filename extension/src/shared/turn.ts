export type TurnPhase = 'idle' | 'recording' | 'processing';
export interface TurnState { phase: TurnPhase; tabId?: number; startedAt: number; stubText?: string; id?: string }
export const STALE_MS = 30000;
export function isStale(s: TurnState, now: number): boolean { return s.phase !== 'idle' && now - s.startedAt > STALE_MS; }
export function onToggle(state: TurnState | undefined, tabId: number, now: number, id: string = crypto.randomUUID()): { next: TurnState; effect: 'start' | 'stop' | 'busy' } {
  if (!state || state.phase === 'idle' || isStale(state, now)) return { next: { phase: 'recording', tabId, startedAt: now, id }, effect: 'start' };
  if (state.phase === 'recording') return { next: { ...state, phase: 'processing' }, effect: 'stop' };
  return { next: state, effect: 'busy' };
}
