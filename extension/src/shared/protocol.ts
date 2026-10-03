import type { Proposal, RejectReason, ConfirmCategory } from './validate.ts';
import type { Snapshot, PageDiff } from './snapshot-format.ts';
export const LIVE_REGION_ID = 'voice-agent-live-region';
export const COMMAND_TOGGLE = 'toggle-listening';
export const SESSION_KEYS = { turn: 'turn', pendingEffect: 'pendingEffect', pending: 'pending', lastResponse: 'lastResponse' } as const;
export const PENDING_EFFECT_MAX_AGE_MS = 15000;
// The only durable conversation setting: one validated enum in chrome.storage.local. Never a transcript, page text or replay text.
export const VERBOSITY_KEY = 'verbosity';
export type ToContent = { type: 'PING' } | { type: 'SNAPSHOT' } | { type: 'EXECUTE'; epoch: number; proposal: Proposal; turnId: string; jobId: string; docId: string; confirmed?: boolean; context?: string } | { type: 'ANNOUNCE'; text: string } | { type: 'SETTLE_DIFF'; preSnapshot: Snapshot } | { type: 'READ_STATUS'; number: string } | { type: 'CANDIDATES' } | { type: 'RECHECK_CANDIDATES'; docId: string; epoch: number; ids: string[] };
// Delivery acknowledgement of an ANNOUNCE: sent only after the live-region mutation happened, and it names the document that spoke.
export type AnnounceResult = { ok: true; docId: string };
export type PingResult = { ok: true; docId?: string };
export type ParcelStatus = { kind: 'status' | 'error'; title: string; description: string };
export type ReadStatusResult = { ok: true; status: ParcelStatus } | { ok: false; error: 'not_found' | 'invalid_number'; captcha?: boolean };
export type SnapshotResult = { ok: true; snapshot: Snapshot; docId: string } | { ok: false; error: 'snapshot_failed' };
export type ExecuteResult = { ok: true; kind: 'click' | 'fill'; name: string; role: string; diff?: PageDiff } | { ok: true; kind: 'none' } | { ok: false; reason: RejectReason; confirm?: { name: string; role: string; category: ConfirmCategory } };
// Read-only exploration: the fresh masked snapshot with the locally eligible controls, and a later recheck of suggested ids. Both are bound to document id and epoch.
export type CandidatesResult = { ok: true; snapshot: Snapshot; docId: string; candidates: ExplorationCandidate[]; incomplete: boolean } | { ok: false; error: 'snapshot_failed' };
export type RecheckResult = { ok: true; candidates: ExplorationCandidate[] } | { ok: false; reason: 'stale' };
export type SettleDiffResult = { ok: true; diff: PageDiff } | { ok: false; error: 'snapshot_failed' };
export type FromContent = { type: 'READY' } | { type: 'EXECUTING'; turnId: string; jobId: string };
// Every recording command and offscreen event carries the immutable id of the turn that owns it, so late events can be ignored.
export type ToOffscreen = { target: 'offscreen'; type: 'REC_START'; turnId: string } | { target: 'offscreen'; type: 'REC_STOP'; turnId: string; stubText?: string };
export type FromOffscreenBody = { type: 'MIC_OPEN' } | { type: 'REC_STOPPED' } | { type: 'TRANSCRIPT'; text: string } | { type: 'TRANSCRIBE_ERROR'; code: 'stt_failed' | 'network' | 'not_recording' } | { type: 'MIC_ERROR'; code: 'not_allowed' | 'no_device' | 'other' };
export type FromOffscreen = { target: 'sw'; turnId: string } & FromOffscreenBody;
export function isFromOffscreen(m: unknown): m is FromOffscreen {
  if (typeof m !== 'object' || m === null) return false;
  const v = m as Record<string, unknown>;
  if (v.target !== 'sw' || typeof v.turnId !== 'string' || !v.turnId) return false;
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
export interface EffectRequestBody { action: ExecutedAction; diff: PageDiff; verbosity?: Verbosity }
export interface EffectResponse { say: string }
export type ExplorationMode = 'summary' | 'actions';
export type Verbosity = 'concise' | 'standard' | 'detailed';
export interface ExplorationCandidate { id: string; role: string; name: string }
export interface ExplorationRequestBody { mode: ExplorationMode; verbosity: Verbosity; snapshot: string; candidates: ExplorationCandidate[] }
export interface ExplorationResponse { sentences: string[]; candidate_ids: string[] }
export interface TranscribeResponse { text: string }
export interface ProxyErrorBody { error: string }
export interface PendingEffectJob { id: string; turnId: string; tabId: number; state: 'proposed' | 'executed' | 'claimed'; action: ExecutedAction; preSnapshot: Snapshot; startedAt: number; effect?: 'model' | 'local' }
