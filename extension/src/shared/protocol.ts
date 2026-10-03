import type { Proposal, RejectReason } from './validate.ts';
import type { Snapshot, PageDiff } from './snapshot-format.ts';
export const LIVE_REGION_ID = 'voice-agent-live-region';
export const COMMAND_TOGGLE = 'toggle-listening';
export const SESSION_KEYS = { turn: 'turn', pendingEffect: 'pendingEffect' } as const;
export const PENDING_EFFECT_MAX_AGE_MS = 15000;
export type ToContent = { type: 'PING' } | { type: 'SNAPSHOT' } | { type: 'EXECUTE'; epoch: number; proposal: Proposal } | { type: 'ANNOUNCE'; text: string } | { type: 'SETTLE_DIFF'; preSnapshot: Snapshot };
export type SnapshotResult = { ok: true; snapshot: Snapshot } | { ok: false; error: 'snapshot_failed' };
export type ExecuteResult = { ok: true; kind: 'click' | 'fill'; name: string; role: string; diff?: PageDiff } | { ok: true; kind: 'none' } | { ok: false; reason: RejectReason };
export type SettleDiffResult = { ok: true; diff: PageDiff } | { ok: false; error: 'snapshot_failed' };
export type FromContent = { type: 'READY' };
export type ToOffscreen = { target: 'offscreen'; type: 'REC_START' } | { target: 'offscreen'; type: 'REC_STOP'; stubText?: string };
export type FromOffscreen = { target: 'sw'; type: 'MIC_OPEN' } | { target: 'sw'; type: 'REC_STOPPED' } | { target: 'sw'; type: 'TRANSCRIPT'; text: string } | { target: 'sw'; type: 'TRANSCRIBE_ERROR'; code: 'stt_failed' | 'network' | 'not_recording' } | { target: 'sw'; type: 'MIC_ERROR'; code: 'not_allowed' | 'no_device' | 'other' };
export function isFromOffscreen(m: unknown): m is FromOffscreen {
  if (typeof m !== 'object' || m === null) return false;
  const v = m as Record<string, unknown>;
  if (v.target !== 'sw') return false;
  switch (v.type) {
    case 'MIC_OPEN': case 'REC_STOPPED': return true;
    case 'TRANSCRIPT': return typeof v.text === 'string';
    case 'TRANSCRIBE_ERROR': return ['stt_failed', 'network', 'not_recording'].includes(v.code as string);
    case 'MIC_ERROR': return ['not_allowed', 'no_device', 'other'].includes(v.code as string);
    default: return false;
  }
}
export interface ActionRequestBody { utterance: string; snapshot: string }
export interface ExecutedAction { kind: 'click' | 'fill'; name: string; role: string }
export interface EffectRequestBody { action: ExecutedAction; diff: PageDiff }
export interface EffectResponse { say: string }
export interface TranscribeResponse { text: string }
export interface ProxyErrorBody { error: string }
export interface PendingEffectJob { id: string; tabId: number; action: ExecutedAction; preSnapshot: Snapshot; startedAt: number }
