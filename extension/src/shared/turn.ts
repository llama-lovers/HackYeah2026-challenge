export type TurnPhase = 'idle' | 'recording' | 'processing';
export interface TurnState { phase: TurnPhase; tabId?: number; startedAt: number; stubText?: string }
export const STALE_MS = 30000;
export function isStale(_s: TurnState, _now: number): boolean { return false; }
export function onToggle(_state: TurnState | undefined, _tabId: number, _now: number): { next: TurnState; effect: 'start' | 'stop' | 'busy' } { return { next: { phase: 'idle', startedAt: 0 }, effect: 'busy' }; }
