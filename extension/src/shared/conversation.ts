import { foldPolish } from './polish-speech.ts';
import type { Verbosity } from './protocol.ts';

// Local conversation commands: matched as COMPLETE normalized phrases, never as substrings, so ordinary dictation that merely
// contains one of these words ("wpisz powtórz w pole ...") stays on the validated action route.
export type VerbosityDirection = 'shorter' | 'longer';
export type ConversationCommand = { kind: 'repeat' } | { kind: 'verbosity'; direction: VerbosityDirection };

const REPEAT_PHRASES = new Set(['powtorz', 'powtorz to', 'powtorz prosze', 'prosze powtorz', 'powtorz to prosze', 'powtorz jeszcze raz', 'powiedz jeszcze raz', 'powiedz to jeszcze raz', 'co powiedziales', 'co mowiles']);

const SHORTER_PHRASES = new Set(['krocej', 'mow krocej', 'mow troche krocej', 'odpowiadaj krocej', 'krocej prosze', 'prosze krocej', 'krotsze odpowiedzi']);
const LONGER_PHRASES = new Set(['dokladniej', 'mow dokladniej', 'mow troche dokladniej', 'odpowiadaj dokladniej', 'dokladniej prosze', 'prosze dokladniej', 'bardziej szczegolowo', 'mow bardziej szczegolowo', 'dokladniejsze odpowiedzi']);

// Case, diacritics, punctuation and spacing are normalized; nothing else is.
export function normalizePhrase(text: string): string {
  return foldPolish(text).replace(/[.,!?;:"'„”…]/gu, ' ').replace(/\s+/gu, ' ').trim();
}
export function parseConversationCommand(text: string): ConversationCommand | null {
  const s = normalizePhrase(text);
  if (REPEAT_PHRASES.has(s)) return { kind: 'repeat' };
  if (SHORTER_PHRASES.has(s)) return { kind: 'verbosity', direction: 'shorter' };
  if (LONGER_PHRASES.has(s)) return { kind: 'verbosity', direction: 'longer' };
  return null;
}

// Three ordered levels, one persisted value. Anything else read from storage is treated as absent and falls back to the default.
export const VERBOSITY_LEVELS: readonly Verbosity[] = ['concise', 'standard', 'detailed'];
export const DEFAULT_VERBOSITY: Verbosity = 'standard';
export function decodeVerbosity(value: unknown): Verbosity {
  return value === 'concise' || value === 'standard' || value === 'detailed' ? value : DEFAULT_VERBOSITY;
}
// The value of the verbosity key in a chrome.storage.local.get(...) result.
export function decodeStoredVerbosity(items: unknown, key: string): Verbosity {
  return typeof items === 'object' && items !== null && !Array.isArray(items) ? decodeVerbosity((items as Record<string, unknown>)[key]) : DEFAULT_VERBOSITY;
}
// One step per command, saturating at both ends.
export function moveVerbosity(current: Verbosity, direction: VerbosityDirection): Verbosity {
  const index = VERBOSITY_LEVELS.indexOf(current) + (direction === 'longer' ? 1 : -1);
  return VERBOSITY_LEVELS[Math.min(VERBOSITY_LEVELS.length - 1, Math.max(0, index))]!;
}

// What a spoken line is for. Only a substantive, successfully delivered message may become the replay buffer; lifecycle statuses,
// pre-action announcements and the replay itself must never overwrite it.
export type OutputIntent = 'substantive' | 'status' | 'pre_action' | 'replay';
export function savesForReplay(intent: OutputIntent): boolean { return intent === 'substantive'; }

// One bounded response, scoped to the tab and document that spoke it. It lives in session storage only.
export const MAX_REPLAY_CHARS = 2000;
export const MAX_DOC_ID_CHARS = 64;
export interface ReplayEntry { tabId: number; docId: string; text: string }
export function makeReplay(tabId: number, docId: unknown, text: string): ReplayEntry | undefined {
  if (!Number.isSafeInteger(tabId) || typeof docId !== 'string' || docId.length === 0 || docId.length > MAX_DOC_ID_CHARS) return undefined;
  if (!text.trim() || Array.from(text).length > MAX_REPLAY_CHARS) return undefined;
  return { tabId, docId, text };
}
// Stored data is decoded, not trusted: exact keys, exact types, bounded size.
export function decodeReplay(value: unknown): ReplayEntry | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const v = value as Record<string, unknown>, keys = Object.keys(v);
  if (keys.length !== 3 || !['tabId', 'docId', 'text'].every(k => keys.includes(k))) return undefined;
  if (typeof v.tabId !== 'number' || typeof v.text !== 'string') return undefined;
  return makeReplay(v.tabId, v.docId, v.text);
}
export function decodeAnnounceAck(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const v = value as Record<string, unknown>;
  return v.ok === true && typeof v.docId === 'string' && v.docId.length > 0 && v.docId.length <= MAX_DOC_ID_CHARS ? v.docId : undefined;
}
