import { CONFIRM_TTL_MS, MAX_REPROMPTS } from './limits.ts';
import { parseIntent } from './intent.ts';
import { wordsToDigits } from './polish-speech.ts';
import { isParcelDigits } from './parcel.ts';
export interface PendingBase { id: string; tabId: number; createdAt: number; reprompts: number }
export type PendingInteraction = PendingBase & ({ kind: 'confirm_parcel'; digits: string } | { kind: 'await_parcel_number' });
export type ReplyRoute = { kind: 'expired' | 'confirm' | 'cancel' | 'reprompt' | 'restart' } | { kind: 'number'; digits: string } | { kind: 'bad_number'; count: number | null };
export function isExpired(p: PendingInteraction, now: number): boolean { return now - p.createdAt > CONFIRM_TTL_MS; }
export function routeReply(p: PendingInteraction, text: string, now: number): ReplyRoute {
  if (isExpired(p, now)) return { kind: 'expired' };
  const intent = parseIntent(text);
  if (intent.kind === 'no') return { kind: 'cancel' };
  if (intent.kind === 'track_parcel') return { kind: 'restart' };
  if (p.kind === 'await_parcel_number') {
    const number = wordsToDigits(text);
    if (number.ok && isParcelDigits(number.digits)) return { kind: 'number', digits: number.digits };
    return p.reprompts >= MAX_REPROMPTS ? { kind: 'cancel' } : { kind: 'bad_number', count: number.ok ? number.digits.length : null };
  }
  if (intent.kind === 'yes') return { kind: 'confirm' };
  return { kind: p.reprompts < MAX_REPROMPTS ? 'reprompt' : 'cancel' };
}
