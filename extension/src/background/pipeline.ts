import { SESSION_KEYS, PENDING_EFFECT_MAX_AGE_MS } from '../shared/protocol.ts';
import type { FromOffscreen, SnapshotResult, ExecuteResult, ExecutedAction, EffectResponse, PendingEffectJob, SettleDiffResult, ReadStatusResult } from '../shared/protocol.ts';
import type { PageDiff, Snapshot } from '../shared/snapshot-format.ts';
import { parseIntent } from '../shared/intent.ts';
import { wordsToDigits, digitsToSpokenGroups, speakable } from '../shared/polish-speech.ts';
import { createBudget, takeStep } from '../shared/limits.ts';
import type { StepBudget } from '../shared/limits.ts';
import { isParcelDigits, pickParcelField, pickSearchButton } from '../shared/parcel.ts';
import { routeReply } from '../shared/pending.ts';
import { optionsFromIds, addContexts } from '../shared/choice.ts';
import type { PendingInteraction } from '../shared/pending.ts';
import { isEmptyDiff } from '../shared/diff.ts';
import type { Proposal, ConfirmCategory } from '../shared/validate.ts';
import { onToggle, isStale } from '../shared/turn.ts';
import type { TurnState } from '../shared/turn.ts';
import { maskText } from '../shared/mask.ts';
import { toModelText, spokenName } from '../shared/snapshot-format.ts';
import * as msg from '../shared/messages.pl.ts';
import { postJson, EgressBlockedError } from './proxy.ts';
let creating: Promise<void> | undefined;
export async function getTurn(): Promise<TurnState> {
  return (await chrome.storage.session.get(SESSION_KEYS.turn))[SESSION_KEYS.turn] as TurnState | undefined ?? { phase: 'idle', startedAt: Date.now() };
}
export async function setTurn(turn: TurnState): Promise<void> { await chrome.storage.session.set({ [SESSION_KEYS.turn]: turn }); }
export async function resetTurn(): Promise<void> { await setTurn({ phase: 'idle', startedAt: Date.now() }); }
export async function ensureOffscreen(): Promise<void> {
  if (creating) return creating;
  creating = (async () => {
    if (!(await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })).length) {
      await chrome.offscreen.createDocument({ url: 'offscreen/offscreen.html', reasons: [chrome.offscreen.Reason.USER_MEDIA], justification: 'Nagrywanie polecenia głosowego po naciśnięciu skrótu' });
    }
  })();
  try { await creating; } finally { creating = undefined; }
}
export async function ping(tabId: number): Promise<boolean> {
  try { return (await chrome.tabs.sendMessage(tabId, { type: 'PING' }, { frameId: 0 })).ok === true; } catch { return false; }
}
export function isSupportedUrl(url?: string): boolean {
  if (!url) return false;
  const u = new URL(url);
  return ['https://inpost.pl', 'https://www.inpost.pl'].includes(u.origin) || (u.origin === new URL(__PROXY_URL__).origin && u.pathname.startsWith('/fixtures/'));
}
export function speakTts(text: string): void { chrome.tts.speak(text, { lang: 'pl-PL', rate: 1.0 }); }
export async function announce(tabId: number | undefined, text: string): Promise<void> {
  if (!text.trim()) return;
  try {
    if (tabId === undefined) throw new Error('no_tab');
    await chrome.tabs.sendMessage(tabId, { type: 'ANNOUNCE', text }, { frameId: 0 });
  } catch { speakTts(text); }
}
export async function announceEffect(tabId: number, action: ExecutedAction, diff: PageDiff, signal?: AbortSignal): Promise<void> {
  if (isEmptyDiff(diff)) { await announce(tabId, msg.noChange(action.kind, action.name)); return; }
  let text: string;
  try {
    const reply = await postJson<EffectResponse>('/api/effect', { action, diff }, 12000, signal);
    text = speakable(reply.say).trim() || msg.effectFallback(action.kind, action.name);
  } catch { text = msg.effectFallback(action.kind, action.name); }
  if (signal?.aborted) return;
  await announce(tabId, text);
}
// State-changing events (shortcut, offscreen notifications) run one at a time so read-modify-write of the turn cannot interleave.
// Long work (model calls, page actions) is deliberately kept outside this queue so a new shortcut can still be answered with "busy".
let serial: Promise<unknown> = Promise.resolve();
export function runSerial<T>(task: () => Promise<T>): Promise<T> {
  const run = serial.then(task, task);
  serial = run.catch(() => {});
  return run;
}
// Cancellation handle per turn: aborted when stale recovery lets a replacement turn start, so old requests cannot act on it.
const controllers = new Map<string, AbortController>();
function turnSignal(id: string): AbortSignal {
  let controller = controllers.get(id);
  if (!controller) { controller = new AbortController(); controllers.set(id, controller); }
  return controller.signal;
}
function abortTurn(id: string | undefined): void { if (id) { controllers.get(id)?.abort(); controllers.delete(id); } }
export async function resetTurnIf(id: string | undefined): Promise<void> { if ((await getTurn()).id === id) await resetTurn(); }
export function handleToggle(tab: chrome.tabs.Tab, opts?: { stubText?: string }): Promise<void> { return runSerial(() => toggle(tab, opts)); }
async function toggle(tab: chrome.tabs.Tab, opts?: { stubText?: string }): Promise<void> {
  if (tab.id === undefined) return;
  const state = await getTurn();
  const { next, effect } = onToggle(state, tab.id, Date.now());
  if (effect === 'busy') { await announce(tab.id, msg.BUSY); return; }
  if (effect === 'start') {
    if (__E2E__ && opts?.stubText !== undefined) next.stubText = opts.stubText;
    // Stale recovery: cancel the abandoned turn (requests, pending effect job) before a replacement may start.
    if (state.phase !== 'idle') { abortTurn(state.id); await chrome.storage.session.remove(SESSION_KEYS.pendingEffect); }
    // Reserve the recording owner before any asynchronous setup; failures only release this reservation.
    await setTurn(next);
    if (!(await ping(tab.id))) {
      speakTts(isSupportedUrl(tab.url) ? msg.RELOAD_PAGE : msg.ONLY_INPOST);
      await resetTurnIf(next.id);
      return;
    }
    try { await ensureOffscreen(); await chrome.runtime.sendMessage({ target: 'offscreen', type: 'REC_START', turnId: next.id }); }
    catch { await announce(tab.id, msg.MIC_NO_DEVICE); await resetTurnIf(next.id); }
  } else {
    await setTurn(next);
    try { await chrome.runtime.sendMessage({ target: 'offscreen', type: 'REC_STOP', turnId: state.id, ...(__E2E__ && state.stubText !== undefined ? { stubText: state.stubText } : {}) }); }
    catch { await announce(state.tabId, msg.STT_FAILED); await resetTurnIf(state.id); }
  }
}
export async function handleOffscreenMessage(message: FromOffscreen): Promise<void> {
  const work = await runSerial(() => onOffscreen(message));
  if (work) await work();
}
async function onOffscreen(message: FromOffscreen): Promise<(() => Promise<void>) | void> {
  const turn = await getTurn();
  // Events of a turn that no longer owns the pipeline (recovered, replaced or finished) are dropped silently.
  if (turn.phase === 'idle' || !turn.id || message.turnId !== turn.id) return;
  switch (message.type) {
    case 'MIC_OPEN': await announce(turn.tabId, msg.LISTENING); break;
    case 'REC_STOPPED':
      if (turn.phase === 'recording') await setTurn({ ...turn, phase: 'processing', startedAt: Date.now() });
      await announce(turn.tabId, msg.PROCESSING); break;
    case 'MIC_ERROR':
      await announce(turn.tabId, message.code === 'not_allowed' ? msg.MIC_DENIED : msg.MIC_NO_DEVICE);
      if (message.code === 'not_allowed') await chrome.runtime.openOptionsPage().catch(() => {});
      await resetTurnIf(turn.id); break;
    case 'TRANSCRIBE_ERROR': await announce(turn.tabId, msg.STT_FAILED); await resetTurnIf(turn.id); break;
    case 'TRANSCRIPT':
      return async () => {
        let outcome: 'handoff' | void = undefined;
        try { outcome = await runCommand(turn.id!, turn.tabId, message.text); }
        finally { controllers.delete(turn.id!); if (outcome !== 'handoff') await runSerial(() => resetTurnIf(turn.id)); }
      };
  }
}
const JOB = SESSION_KEYS.pendingEffect;
async function getJob(): Promise<PendingEffectJob | undefined> { return (await chrome.storage.session.get(JOB))[JOB] as PendingEffectJob | undefined; }
async function dropJob(id: string): Promise<void> { if ((await getJob())?.id === id) await chrome.storage.session.remove(JOB); }
async function ownsTurn(turnId: string): Promise<boolean> { return !turnSignal(turnId).aborted && (await getTurn()).id === turnId; }
export async function getPending(): Promise<PendingInteraction | undefined> { return (await chrome.storage.session.get(SESSION_KEYS.pending))[SESSION_KEYS.pending] as PendingInteraction | undefined; }
export function setPending(turnId: string, pending: PendingInteraction): Promise<void> { return runSerial(async () => { if (await ownsTurn(turnId)) await chrome.storage.session.set({ [SESSION_KEYS.pending]: pending }); }); }
export function claimPending(turnId: string): Promise<PendingInteraction | undefined> { return runSerial(async () => { if (!(await ownsTurn(turnId))) return undefined; const p = await getPending(); await chrome.storage.session.remove(SESSION_KEYS.pending); return p; }); }
export type CommandRun = { turnId: string; tabId: number; signal: AbortSignal; budget: StepBudget };
type ProposalStep = { proposal: Proposal; epoch: number; docId: string; preSnapshot: Snapshot; announce: 'model' | 'none' | 'local'; confirmed?: boolean; context?: string; category?: ConfirmCategory };
export async function performProposal(run: CommandRun, step: ProposalStep): Promise<'done' | 'handoff' | 'stopped'> {
  const { turnId, tabId, signal } = run, { proposal } = step;
  const say = async (text: string) => { if (await ownsTurn(turnId)) await announce(tabId, text); };
  if (!(await ownsTurn(turnId))) return 'stopped';
  let jobId = '';
  if (proposal.action === 'click' || proposal.action === 'fill') {
    const node = step.preSnapshot.nodes.find(n => n.id === proposal.target);
    const job: PendingEffectJob = { id: crypto.randomUUID(), turnId, tabId, state: 'proposed', action: { kind: proposal.action, name: node ? spokenName(node) : '', role: node?.role ?? '' }, preSnapshot: step.preSnapshot, startedAt: Date.now(), effect: step.announce === 'model' ? 'model' : 'local' };
    jobId = job.id;
    await runSerial(async () => { if (await ownsTurn(turnId)) await chrome.storage.session.set({ [JOB]: job }); });
  }
  if (!(await ownsTurn(turnId))) return 'stopped';
  // Charge only click/fill messages actually sent; reads and announcements are free.
  if (['click', 'fill'].includes(proposal.action) && !takeStep(run.budget)) { if (jobId) await runSerial(() => dropJob(jobId)); await say(msg.STEP_LIMIT); return 'stopped'; }
  let executed: ExecuteResult;
  try { executed = await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE', epoch: step.epoch, proposal, turnId, jobId, docId: step.docId, confirmed: step.confirmed }, { frameId: 0 }); }
  catch {
    const job = await getJob();
    if (jobId && job?.id === jobId && job.state !== 'proposed') return 'handoff';
    if (jobId) await runSerial(() => dropJob(jobId));
    await say(msg.ACTION_FAILED); return 'stopped';
  }
  if (jobId) await runSerial(() => dropJob(jobId));
  if (!(await ownsTurn(turnId))) return 'stopped';
  if (!executed.ok) {
    if (executed.confirm && step.confirmed !== true && (proposal.action === 'click' || proposal.action === 'fill')) {
      await setPending(turnId, { kind: 'confirm_action', proposal, epoch: step.epoch, docId: step.docId, preSnapshot: step.preSnapshot, ...executed.confirm, context: step.context, id: crypto.randomUUID(), tabId, createdAt: Date.now(), reprompts: 0 });
      await say(msg.confirmPrompt(proposal.action, executed.confirm.name, executed.confirm.category, step.context));
    } else await say(msg.rejectionText(executed.reason));
    return 'stopped';
  }
  if (executed.kind === 'none') { await say(msg.noneSay(proposal.say)); return 'stopped'; }
  if (step.announce === 'model') await announceEffect(tabId, { kind: executed.kind, name: executed.name, role: executed.role }, executed.diff ?? { added: [], removed: [], changed: [], alerts: [] }, signal);
  else if (step.announce === 'local') await say(msg.localEffect({ kind: executed.kind, name: executed.name, role: executed.role }, executed.diff ?? { added: [], removed: [], changed: [], alerts: [] }, step.category));
  return 'done';
}
export async function runParcelSearch(run: CommandRun, digits: string): Promise<'handoff' | void> {
  const say = async (text: string) => { if (await ownsTurn(run.turnId)) await announce(run.tabId, text); };
  try {
    let result: SnapshotResult = await chrome.tabs.sendMessage(run.tabId, { type: 'SNAPSHOT' }, { frameId: 0 });
    if (!result.ok) { await say(msg.SNAPSHOT_FAILED); return; }
    const field = pickParcelField(result.snapshot), button = pickSearchButton(result.snapshot);
    if (!field?.id || !button?.id) { await say(msg.PARCEL_FORM_MISSING); return; }
    const fill = await performProposal(run, { proposal: { action: 'fill', target: field.id, text: digits, needs_confirmation: false, say: '' }, epoch: result.snapshot.epoch, docId: result.docId, preSnapshot: result.snapshot, announce: 'none' });
    if (fill !== 'done') return fill === 'handoff' ? 'handoff' : undefined;
    result = await chrome.tabs.sendMessage(run.tabId, { type: 'SNAPSHOT' }, { frameId: 0 });
    if (!result.ok) { await say(msg.SNAPSHOT_FAILED); return; }
    const search = pickSearchButton(result.snapshot);
    if (!search?.id) { await say(msg.PARCEL_FORM_MISSING); return; }
    const click = await performProposal(run, { proposal: { action: 'click', target: search.id, text: '', needs_confirmation: false, say: '' }, epoch: result.snapshot.epoch, docId: result.docId, preSnapshot: result.snapshot, announce: 'none' });
    if (click !== 'done') return click === 'handoff' ? 'handoff' : undefined;
    const status: ReadStatusResult = await chrome.tabs.sendMessage(run.tabId, { type: 'READ_STATUS', number: digits }, { frameId: 0 });
    await say(status.ok ? msg.statusSpeech(status.status) : msg.STATUS_UNREAD);
  } catch { await say(msg.STATUS_UNREAD); }
}
async function parcelReadback(run: CommandRun, digits: string): Promise<void> {
  const say = async (text: string) => { if (await ownsTurn(run.turnId)) await announce(run.tabId, text); };
  try {
    const result: SnapshotResult = await chrome.tabs.sendMessage(run.tabId, { type: 'SNAPSHOT' }, { frameId: 0 });
    if (!result.ok) { await say(msg.SNAPSHOT_FAILED); return; }
    if (!pickParcelField(result.snapshot) || !pickSearchButton(result.snapshot)) { await say(msg.PARCEL_FORM_MISSING); return; }
    await setPending(run.turnId, { kind: 'confirm_parcel', digits, id: crypto.randomUUID(), tabId: run.tabId, createdAt: Date.now(), reprompts: 0 });
    await say(msg.parcelReadback(digitsToSpokenGroups(digits)));
  } catch { await say(msg.SNAPSHOT_FAILED); }
}
export async function runCommand(turnId: string, tabId: number | undefined, rawText: string): Promise<'handoff' | void> {
  const signal = turnSignal(turnId);
  const run: CommandRun = { turnId, tabId: tabId!, signal, budget: createBudget() };
  const say = async (text: string) => { if (await ownsTurn(turnId)) await announce(tabId, text); };
  const text = rawText.trim();
  if (!text) { await say(msg.NOTHING_HEARD); return; }
  const pending = await claimPending(turnId);
  const intent = parseIntent(text);
  if (pending && pending.tabId === tabId) {
    const reply = routeReply(pending, text, Date.now());
    if (reply.kind === 'choose' && pending.kind === 'choose_option') {
      const option = pending.options[reply.index]!;
      const outcome = await performProposal(run, { proposal: {action:pending.action, target:option.id, text:pending.text, needs_confirmation:pending.needsConfirmation, say:''}, epoch:pending.epoch, docId:pending.docId, preSnapshot:pending.preSnapshot, announce:'model', context:option.context });
      return outcome === 'handoff' ? 'handoff' : undefined;
    }
    if (reply.kind === 'confirm' && pending.kind === 'confirm_parcel') return runParcelSearch(run, pending.digits);
    if (reply.kind === 'confirm' && pending.kind === 'confirm_action') {
      const outcome = await performProposal(run, { proposal: pending.proposal, epoch: pending.epoch, docId: pending.docId, preSnapshot: pending.preSnapshot, announce: 'local', confirmed: true, category: pending.category });
      return outcome === 'handoff' ? 'handoff' : undefined;
    }
    if (reply.kind === 'cancel') { await say(msg.CANCELLED); return; }
    if (reply.kind === 'reprompt') { await setPending(turnId, { ...pending, reprompts: pending.reprompts + 1 }); await say(pending.kind === 'choose_option' ? msg.choiceReprompt(pending.options.length) : msg.CONFIRM_REPROMPT); return; }
    if (reply.kind === 'number') return parcelReadback(run, reply.digits);
    if (reply.kind === 'bad_number') { await setPending(turnId, { ...pending, reprompts: pending.reprompts + 1 }); await say(reply.count === null ? msg.PARCEL_NOT_UNDERSTOOD : msg.parcelWrongLength(reply.count)); return; }
    if (reply.kind === 'expired' && (intent.kind === 'yes' || intent.kind === 'no')) { await say(msg.CONFIRM_EXPIRED); return; }
  }
  if (intent.kind === 'track_parcel') {
    if (tabId === undefined) { await say(msg.SNAPSHOT_FAILED); return; }
    const number = wordsToDigits(intent.rest);
    if (number.ok && isParcelDigits(number.digits)) return parcelReadback(run, number.digits);
    await setPending(turnId, { kind: 'await_parcel_number', id: crypto.randomUUID(), tabId, createdAt: Date.now(), reprompts: 0 });
    await say(!intent.rest ? msg.PARCEL_ASK_NUMBER : !number.ok ? msg.PARCEL_NOT_UNDERSTOOD : msg.parcelWrongLength(number.digits.length));
    return;
  }
  if (intent.kind === 'yes' || intent.kind === 'no') { await say(msg.NOTHING_TO_CONFIRM); return; }
  let result: SnapshotResult;
  try {
    if (tabId === undefined) throw new Error('no_tab');
    result = await chrome.tabs.sendMessage(tabId, { type: 'SNAPSHOT' }, { frameId: 0 });
    if (!result.ok) throw new Error('snapshot_failed');
  } catch { await say(msg.SNAPSHOT_FAILED); return; }
  if (!(await ownsTurn(turnId))) return;
  let proposal: Proposal;
  try {
    const utterance = Array.from(maskText(text)).slice(0, 500).join('');
    proposal = await postJson('/api/action', { utterance, snapshot: toModelText(result.snapshot) }, 20000, signal);
  } catch (error) { await say(error instanceof EgressBlockedError ? msg.SNAPSHOT_FAILED : msg.ASSISTANT_FAILED); return; }
  if (!(await ownsTurn(turnId))) return;
  if (proposal.action === 'choose') {
    const action = proposal.text ? 'fill' : 'click';
    const options = addContexts(result.snapshot, optionsFromIds(result.snapshot, [proposal.option_1 ?? '', proposal.option_2 ?? '', proposal.option_3 ?? ''], action));
    if (options.length < 2) { await say(msg.CHOICE_UNCLEAR); return; }
    await setPending(turnId, {kind:'choose_option',action,text:proposal.text,needsConfirmation:proposal.needs_confirmation,epoch:result.snapshot.epoch,docId:result.docId,preSnapshot:result.snapshot,options,id:crypto.randomUUID(),tabId:tabId!,createdAt:Date.now(),reprompts:0});
    await say(msg.choicePrompt(options)); return;
  }
  const outcome = await performProposal(run, { proposal, epoch: result.snapshot.epoch, docId: result.docId, preSnapshot: result.snapshot, announce: 'model' });
  return outcome === 'handoff' ? 'handoff' : undefined;
}
// The content script calls this right before it performs a click/fill; only after the acknowledgement does it act.
export function handleExecuting(tabId: number | undefined, message: { turnId: string; jobId: string }): Promise<boolean> {
  return runSerial(async () => {
    const [turn, job] = [await getTurn(), await getJob()];
    if (!job || job.id !== message.jobId || job.turnId !== message.turnId || job.tabId !== tabId || job.state !== 'proposed' || turn.id !== message.turnId || turn.phase !== 'processing') return false;
    await chrome.storage.session.set({ [JOB]: { ...job, state: 'executed', startedAt: Date.now() } });
    // The deadline does not depend on a READY ever arriving (the destination may be outside the extension's pages).
    setTimeout(() => { void expireJob(job.id); }, PENDING_EFFECT_MAX_AGE_MS);
    return true;
  });
}
export function expireJob(jobId: string): Promise<void> {
  return runSerial(async () => {
    const job = await getJob();
    if (!job || job.id !== jobId || job.state !== 'executed') return;
    await chrome.storage.session.remove(JOB);
    if ((await getTurn()).id !== job.turnId) return;
    await announce(job.tabId, msg.EFFECT_UNKNOWN);
    await resetTurnIf(job.turnId);
  });
}
export function handleTabRemoved(tabId: number): Promise<void> {
  return runSerial(async () => {
    if ((await getPending())?.tabId === tabId) await chrome.storage.session.remove(SESSION_KEYS.pending);
    const [turn, job] = [await getTurn(), await getJob()];
    if (job?.tabId === tabId) await chrome.storage.session.remove(JOB);
    if (turn.phase !== 'idle' && turn.tabId === tabId) { abortTurn(turn.id); await resetTurnIf(turn.id); }
  });
}
export async function handleReady(tabId: number): Promise<void> {
  const job = await runSerial(async () => {
    const job = await getJob();
    if (!job || job.tabId !== tabId || job.state === 'claimed') return undefined;
    // A new document before the page confirmed the action: nothing was done, so there is nothing to describe.
    if (job.state === 'proposed' || (await getTurn()).id !== job.turnId) { await chrome.storage.session.remove(JOB); return undefined; }
    if (Date.now() - job.startedAt > PENDING_EFFECT_MAX_AGE_MS) {
      await chrome.storage.session.remove(JOB);
      await announce(tabId, msg.EFFECT_UNKNOWN); await resetTurnIf(job.turnId);
      return undefined;
    }
    await chrome.storage.session.set({ [JOB]: { ...job, state: 'claimed' } });
    return job;
  });
  if (!job) return;
  try {
    const result: SettleDiffResult = await chrome.tabs.sendMessage(tabId, { type: 'SETTLE_DIFF', preSnapshot: job.preSnapshot }, { frameId: 0 });
    if (!result.ok) throw new Error('snapshot_failed');
    if (!(await ownsTurn(job.turnId))) return;
    if (job.effect === 'local') await announce(tabId, msg.localEffect(job.action, result.diff));
    else await announceEffect(tabId, job.action, result.diff, turnSignal(job.turnId));
  } catch { if (await ownsTurn(job.turnId)) await announce(tabId, msg.effectFallback(job.action.kind, job.action.name)); }
  finally { await runSerial(async () => { await resetTurnIf(job.turnId); await dropJob(job.id); }); }
}
