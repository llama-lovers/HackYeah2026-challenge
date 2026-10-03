import { CONFIRM_TTL_MS, MAX_REPROMPTS } from './limits.ts';
import { parseIntent } from './intent.ts';
import { wordsToDigits } from './polish-speech.ts';
import { isParcelDigits } from './parcel.ts';
import type { Proposal, ConfirmCategory } from './validate.ts';
import type { Snapshot } from './snapshot-format.ts';
import { parseChoice } from './choice.ts';
import type { ChoiceOption } from './choice.ts';
export interface PendingBase { id: string; tabId: number; createdAt: number; reprompts: number }
export type PendingInteraction = PendingBase & ({ kind: 'confirm_parcel'; digits: string } | { kind: 'await_parcel_number' } | { kind: 'confirm_action'; proposal: Proposal; epoch: number; docId: string; preSnapshot: Snapshot; name: string; role: string; category: ConfirmCategory; context?: string } | { kind: 'choose_option'; action: 'click' | 'fill'; text: string; needsConfirmation: boolean; epoch: number; docId: string; preSnapshot: Snapshot; options: ChoiceOption[] });
export type ReplyRoute = { kind: 'expired' | 'confirm' | 'cancel' | 'reprompt' | 'restart' } | { kind: 'number'; digits: string } | { kind: 'bad_number'; count: number | null } | { kind: 'choose'; index: number };
export function isExpired(p: PendingInteraction, now: number): boolean { return now - p.createdAt > CONFIRM_TTL_MS; }
export function routeReply(p: PendingInteraction, text: string, now: number): ReplyRoute {
  if (isExpired(p, now)) return { kind: 'expired' };
  const intent = parseIntent(text);
  if (intent.kind === 'no') return { kind: 'cancel' };
  if (p.kind === 'choose_option') {
    const n = parseChoice(text, p.options.length);
    return typeof n === 'number' ? { kind: 'choose', index: n - 1 } : { kind: p.reprompts < MAX_REPROMPTS ? 'reprompt' : 'cancel' };
  }
  if (intent.kind === 'track_parcel' && p.kind !== 'confirm_action') return { kind: 'restart' };
  if (p.kind === 'await_parcel_number') {
    const number = wordsToDigits(text);
    if (number.ok && isParcelDigits(number.digits)) return { kind: 'number', digits: number.digits };
    return p.reprompts >= MAX_REPROMPTS ? { kind: 'cancel' } : { kind: 'bad_number', count: number.ok ? number.digits.length : null };
  }
  if (intent.kind === 'yes') return { kind: 'confirm' };
  return { kind: p.reprompts < MAX_REPROMPTS ? 'reprompt' : 'cancel' };
}
