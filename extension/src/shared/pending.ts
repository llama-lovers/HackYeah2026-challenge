import { CONFIRM_TTL_MS, MAX_REPROMPTS } from './limits.ts';
import { parseIntent } from './intent.ts';
export interface PendingBase { id: string; tabId: number; createdAt: number; reprompts: number }
export type PendingInteraction = PendingBase & ({ kind: 'confirm_parcel'; digits: string } | { kind: 'await_parcel_number' });
export type ReplyRoute = { kind: 'expired' | 'confirm' | 'cancel' | 'reprompt' | 'restart' };
export function isExpired(p: PendingInteraction, now: number): boolean { return now - p.createdAt > CONFIRM_TTL_MS; }
export function routeReply(p: PendingInteraction, text: string, now: number): ReplyRoute {
  if (isExpired(p, now)) return { kind: 'expired' };
  const intent = parseIntent(text);
  if (intent.kind === 'yes') return { kind: 'confirm' };
  if (intent.kind === 'no') return { kind: 'cancel' };
  if (intent.kind === 'track_parcel') return { kind: 'restart' };
  return { kind: p.reprompts < MAX_REPROMPTS ? 'reprompt' : 'cancel' };
}
