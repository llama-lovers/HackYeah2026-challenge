import { resolveTarget, getLastSnapshot, takeSnapshot } from './snapshot.ts';
import { diffSnapshots } from '../shared/diff.ts';
import { startSettleWatch } from './settle.ts';
import { validateProposal, isConfirmable } from '../shared/validate.ts';
import type { Proposal } from '../shared/validate.ts';
import type { ExecuteResult } from '../shared/protocol.ts';
import { spokenName } from '../shared/snapshot-format.ts';
import { clickPre, fillPre } from '../shared/messages.pl.ts';
export async function execute(epoch: number, proposal: Proposal, announcer: { host: HTMLElement; announce(text: string): void | Promise<void> }, commit: () => Promise<boolean> = async () => true, opts: { confirmed?: boolean } = {}): Promise<ExecuteResult> {
  let resolved = ['click', 'fill'].includes(proposal.action) ? resolveTarget(proposal.target, epoch) : { target: null, element: null, node: null };
  const verdict = validateProposal(proposal, resolved.target, opts);
  if (!verdict.ok) {
    if (isConfirmable(verdict.reason) && opts.confirmed !== true && resolved.node && resolved.target) {
      if (resolved.target.drifted) return { ok: false, reason: 'stale' };
      return { ...verdict, confirm: { name: spokenName(resolved.node), role: resolved.node.role, category: resolved.target.consent ? 'consent' : verdict.reason === 'needs_confirmation' ? 'model_flag' : 'irreversible' } };
    }
    return verdict;
  }
  if (verdict.kind === 'none') return { ok: true, kind: 'none' };
  if (!(resolved.element instanceof HTMLElement) || !resolved.node) return { ok: false, reason: 'role_mismatch' };
  if (verdict.kind === 'fill' && !(resolved.element instanceof HTMLInputElement || resolved.element instanceof HTMLTextAreaElement)) return { ok: false, reason: 'role_mismatch' };
  const name = spokenName(resolved.node);
  await announcer.announce(verdict.kind === 'click' ? clickPre(name) : fillPre(name));
  await new Promise(resolve => setTimeout(resolve, 300));
  // Revalidate all live policy signals across the announcement delay.
  resolved = resolveTarget(proposal.target, epoch);
  const liveVerdict = validateProposal(proposal, resolved.target, opts);
  if (!liveVerdict.ok) return liveVerdict;
  const pre = getLastSnapshot();
  if (!pre || pre.epoch !== epoch) return { ok: false, reason: 'stale' };
  const element = resolved.element as HTMLElement;
  element.scrollIntoView({ block: 'center' });
  if (verdict.kind === 'fill') {
    element.focus();
    // Focus handlers run page code synchronously and may repurpose the field (password/OTP, disabled, detached, shorter maxlength): revalidate before writing.
    const afterFocus = resolveTarget(proposal.target, epoch);
    const focusVerdict = validateProposal(proposal, afterFocus.target, opts);
    if (!focusVerdict.ok) return focusVerdict;
    if (afterFocus.element !== element || !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return { ok: false, reason: 'role_mismatch' };
  }
  // The background must acknowledge that the side effect is about to happen before it happens; without the acknowledgement nothing is done.
  if (!(await commit())) return { ok: false, reason: 'unconfirmed' };
  const final = resolveTarget(proposal.target, epoch), finalVerdict = validateProposal(proposal, final.target, opts);
  if (!finalVerdict.ok) return finalVerdict;
  if (final.element !== element) return { ok: false, reason: 'stale' };
  const settled = startSettleWatch({ ignore: el => announcer.host.contains(el) });
  if (verdict.kind === 'click') element.click();
  else {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, proposal.text);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    const key = Array.from(proposal.text).at(-1) ?? '';
    for (const type of ['keydown', 'keyup']) element.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  }
  await settled;
  const post = takeSnapshot(document, { excludeRoot: announcer.host });
  return { ok: true, kind: verdict.kind, name, role: resolved.node!.role, diff: diffSnapshots(pre, post) };
}
