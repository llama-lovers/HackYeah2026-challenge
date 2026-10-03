import { foldPolish } from './polish-speech.ts';

// Local conversation commands: matched as COMPLETE normalized phrases, never as substrings, so ordinary dictation that merely
// contains one of these words ("wpisz powtórz w pole ...") stays on the validated action route.
export type ConversationCommand = { kind: 'repeat' };

const REPEAT_PHRASES = new Set(['powtorz', 'powtorz to', 'powtorz prosze', 'prosze powtorz', 'powtorz to prosze', 'powtorz jeszcze raz', 'powiedz jeszcze raz', 'powiedz to jeszcze raz', 'co powiedziales', 'co mowiles']);

// Case, diacritics, punctuation and spacing are normalized; nothing else is.
export function normalizePhrase(text: string): string {
  return foldPolish(text).replace(/[.,!?;:"'„”…]/gu, ' ').replace(/\s+/gu, ' ').trim();
}
export function parseConversationCommand(text: string): ConversationCommand | null {
  const s = normalizePhrase(text);
  if (REPEAT_PHRASES.has(s)) return { kind: 'repeat' };
  return null;
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
