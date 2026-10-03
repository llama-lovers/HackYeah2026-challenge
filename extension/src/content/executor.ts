import { resolveTarget, getLastSnapshot, takeSnapshot } from './snapshot.ts';
import { diffSnapshots } from '../shared/diff.ts';
import { startSettleWatch } from './settle.ts';
import { validateProposal } from '../shared/validate.ts';
import type { Proposal } from '../shared/validate.ts';
import type { ExecuteResult } from '../shared/protocol.ts';
import { spokenName } from '../shared/snapshot-format.ts';
import { clickPre, fillPre } from '../shared/messages.pl.ts';
export async function execute(epoch: number, proposal: Proposal, announcer: { host: HTMLElement; announce(text: string): void | Promise<void> }): Promise<ExecuteResult> {
  let resolved = ['click', 'fill'].includes(proposal.action) ? resolveTarget(proposal.target, epoch) : { target: null, element: null, node: null };
  const verdict = validateProposal(proposal, resolved.target);
  if (!verdict.ok) return verdict;
  if (verdict.kind === 'none') return { ok: true, kind: 'none' };
  if (!(resolved.element instanceof HTMLElement) || !resolved.node) return { ok: false, reason: 'role_mismatch' };
  if (verdict.kind === 'fill' && !(resolved.element instanceof HTMLInputElement || resolved.element instanceof HTMLTextAreaElement)) return { ok: false, reason: 'role_mismatch' };
  const name = spokenName(resolved.node);
  await announcer.announce(verdict.kind === 'click' ? clickPre(name) : fillPre(name));
  await new Promise(resolve => setTimeout(resolve, 300));
  // Revalidate all live policy signals across the announcement delay.
  resolved = resolveTarget(proposal.target, epoch);
  const liveVerdict = validateProposal(proposal, resolved.target);
  if (!liveVerdict.ok) return liveVerdict;
  const pre = getLastSnapshot();
  if (!pre || pre.epoch !== epoch) return { ok: false, reason: 'stale' };
  const element = resolved.element as HTMLElement;
  element.scrollIntoView({ block: 'center' });
  const settled = startSettleWatch({ ignore: el => announcer.host.contains(el) });
  if (verdict.kind === 'click') element.click();
  else {
    element.focus();
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
