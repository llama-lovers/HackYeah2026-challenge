import type { Proposal, RejectReason, ConfirmCategory } from './validate.ts';
import type { Snapshot, PageDiff } from './snapshot-format.ts';
export const LIVE_REGION_ID = 'voice-agent-live-region';
export const COMMAND_TOGGLE = 'toggle-listening';
export const COMMAND_STOP = 'stop-listening';
export const SESSION_KEYS = { turn: 'turn', pendingEffect: 'pendingEffect', pending: 'pending', lastResponse: 'lastResponse' } as const;
export const PENDING_EFFECT_MAX_AGE_MS = 15000;
// The only durable conversation setting: one validated enum in chrome.storage.local. Never a transcript, page text or replay text.
export const VERBOSITY_KEY = 'verbosity';
export type OutputRequest = { type: 'OUTPUT'; turnId: string; docId: string; generation: number; text: string; intent: 'pre_action' };
export function decodeOutputRequest(value: unknown): OutputRequest | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  if (v.type !== 'OUTPUT' || v.intent !== 'pre_action' || typeof v.text !== 'string' || !v.text.trim() || v.text.length > 2000 || typeof v.turnId !== 'string' || !v.turnId || v.turnId.length > 64 || typeof v.docId !== 'string' || !v.docId || v.docId.length > 64 || !Number.isSafeInteger(v.generation) || (v.generation as number) < 0) return undefined;
  return { type: 'OUTPUT', turnId: v.turnId, docId: v.docId, generation: v.generation as number, text: v.text, intent: 'pre_action' };
}
export type ToContent = { type: 'CANCEL_OUTPUT'; generation: number } | { type: 'PING' } | { type: 'SNAPSHOT' } | { type: 'EXECUTE'; epoch: number; proposal: Proposal; turnId: string; jobId: string; docId: string; generation?: number; confirmed?: boolean; context?: string } | { type: 'ANNOUNCE'; text: string; generation?: number } | { type: 'SETTLE_DIFF'; preSnapshot: Snapshot } | { type: 'READ_STATUS'; number: string } | { type: 'CANDIDATES' } | { type: 'RECHECK_CANDIDATES'; docId: string; epoch: number; ids: string[] } | ScrollRequest;
// Delivery acknowledgement of an ANNOUNCE: sent only after the live-region mutation happened, and it names the document that spoke.
export type AnnounceResult = { ok: true; docId: string };
export type PingResult = { ok: true; docId?: string };
// Voice scrolling of the top-level document. The request is bound to the turn, tab, document and frame 0 that asked; the result is measured
// by the page, never assumed: moved, already at the boundary, or unsupported (the visible content does not live in the document scroller).
export type ScrollDirection = 'down' | 'up' | 'top';
export type ScrollRequest = { type: 'SCROLL'; direction: ScrollDirection; turnId: string; tabId: number; docId: string; frameId: 0; generation?: number };
export type ScrollOutcome = 'moved' | 'boundary' | 'unsupported';
export type ScrollResult = { ok: true; docId: string; outcome: ScrollOutcome; before: number; after: number; max: number } | { ok: false; reason: 'stale' | 'invalid' };
export function decodeScrollRequest(m: unknown): ScrollRequest | null {
  if (typeof m !== 'object' || m === null) return null;
  const v = m as Record<string, unknown>;
  if (v.type !== 'SCROLL' || !['down', 'up', 'top'].includes(v.direction as string)) return null;
  if (typeof v.turnId !== 'string' || !v.turnId || v.turnId.length > 64 || typeof v.docId !== 'string' || !v.docId || v.docId.length > 64) return null;
  if (typeof v.tabId !== 'number' || !Number.isSafeInteger(v.tabId) || v.frameId !== 0) return null;
  return { type: 'SCROLL', direction: v.direction as ScrollDirection, turnId: v.turnId, tabId: v.tabId, docId: v.docId, frameId: 0, ...(typeof v.generation === 'number' ? { generation: v.generation } : {}) };
}
// The reply crosses a runtime message boundary: shape, numbers and the echoed document id are checked before anything is spoken from it.
export function decodeScrollResult(m: unknown, expectedDocId: string): ScrollResult | null {
  if (typeof m !== 'object' || m === null) return null;
  const v = m as Record<string, unknown>;
  if (v.ok === false) return v.reason === 'stale' || v.reason === 'invalid' ? { ok: false, reason: v.reason } : null;
  if (v.ok !== true || v.docId !== expectedDocId || !['moved', 'boundary', 'unsupported'].includes(v.outcome as string)) return null;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1e9;
  if (!finite(v.before) || !finite(v.after) || !finite(v.max)) return null;
  return { ok: true, docId: expectedDocId, outcome: v.outcome as ScrollOutcome, before: v.before, after: v.after, max: v.max };
}
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
export type ToOffscreen = { target: 'offscreen'; type: 'REC_START'; turnId: string } | { target: 'offscreen'; type: 'REC_STOP'; turnId: string; stubText?: string } | { target: 'offscreen'; type: 'REC_DISCARD'; turnId?: string };
// Typed failure categories only: the offscreen document never forwards provider text, exception text or response bodies.
export const STT_ERROR_CODES = ['stt_failed', 'stt_timeout', 'stt_invalid', 'not_configured', 'network', 'not_recording'] as const;
export const MIC_ERROR_CODES = ['not_allowed', 'no_device', 'other'] as const;
export type SttErrorCode = typeof STT_ERROR_CODES[number];
export type MicErrorCode = typeof MIC_ERROR_CODES[number];
export type RecordingCompletion = 'toggle' | 'silence' | 'cap';
export type FromOffscreenBody = { type: 'MIC_OPEN'; cuePlayed?: boolean } | { type: 'REC_STOPPED'; reason?: RecordingCompletion; closeCuePlayed?: boolean } | { type: 'TRANSCRIPT'; text: string } | { type: 'TRANSCRIBE_ERROR'; code: SttErrorCode } | { type: 'MIC_ERROR'; code: MicErrorCode };
export type FromOffscreen = { target: 'sw'; turnId: string } & FromOffscreenBody;
export function isFromOffscreen(m: unknown): m is FromOffscreen {
  if (typeof m !== 'object' || m === null) return false;
  const v = m as Record<string, unknown>;
  if (v.target !== 'sw' || typeof v.turnId !== 'string' || !v.turnId) return false;
  switch (v.type) {
    case 'MIC_OPEN': case 'REC_STOPPED': return true;
    case 'TRANSCRIPT': return typeof v.text === 'string' && v.text.length <= MAX_TRANSCRIPT_CHARS;
    case 'TRANSCRIBE_ERROR': return (STT_ERROR_CODES as readonly string[]).includes(v.code as string);
    case 'MIC_ERROR': return (MIC_ERROR_CODES as readonly string[]).includes(v.code as string);
    default: return false;
  }
}
// Success bodies cross a trust boundary (proxy, provider, model): shape and bounds are decoded before anything is spoken or sent to a page.
// A null result always means "treat as a failure"; nothing is executed from a body that does not decode.
export const MAX_TRANSCRIPT_CHARS = 2000;
export function decodeTranscriptBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const text = (body as Record<string, unknown>).text;
  return typeof text === 'string' && text.length <= MAX_TRANSCRIPT_CHARS ? text : null;
}
// The proxy status is the only thing inspected: its body (which may carry provider text) is never read on failure, so no raw diagnostics can leave this file.
export function sttCodeForStatus(status: number): SttErrorCode {
  if (status === 504) return 'stt_timeout';
  if (status === 503) return 'not_configured';
  if (status === 400 || status === 413 || status === 415 || status === 422 || status >= 500) return 'stt_failed';
  return 'network';
}
const optionalId = (v: unknown): v is string | undefined => v === undefined || (typeof v === 'string' && v.length <= 64);
export function decodeProposal(body: unknown): Proposal | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const v = body as Record<string, unknown>;
  if (typeof v.action !== 'string' || !['click', 'fill', 'choose', 'none'].includes(v.action)) return null;
  if (typeof v.target !== 'string' || v.target.length > 64 || typeof v.text !== 'string' || v.text.length > 500) return null;
  if (typeof v.needs_confirmation !== 'boolean' || typeof v.say !== 'string' || v.say.length > 1000) return null;
  if (!optionalId(v.option_1) || !optionalId(v.option_2) || !optionalId(v.option_3)) return null;
  if ((v.action === 'click' || v.action === 'fill') && !v.target) return null;
  return { action: v.action, target: v.target, text: v.text, needs_confirmation: v.needs_confirmation, say: v.say, ...(v.option_1 !== undefined ? { option_1: v.option_1 } : {}), ...(v.option_2 !== undefined ? { option_2: v.option_2 } : {}), ...(v.option_3 !== undefined ? { option_3: v.option_3 } : {}) };
}
export function decodeEffect(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const say = (body as Record<string, unknown>).say;
  return typeof say === 'string' && say.length <= 1000 ? say : null;
}
// Safe failure categories of a proxy/model round trip. Only the category is ever used for speech; bodies and exception text never are.
export type FailureKind = 'blocked' | 'timeout' | 'network' | 'not_configured' | 'invalid_output' | 'unavailable';
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
