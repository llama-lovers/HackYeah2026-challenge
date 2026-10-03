import { SESSION_KEYS, PENDING_EFFECT_MAX_AGE_MS } from '../shared/protocol.ts';
import type { FromOffscreen, SnapshotResult, ExecuteResult, ExecutedAction, EffectResponse, PendingEffectJob, SettleDiffResult } from '../shared/protocol.ts';
import type { PageDiff } from '../shared/snapshot-format.ts';
import { isEmptyDiff } from '../shared/diff.ts';
import type { Proposal } from '../shared/validate.ts';
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
    text = reply.say.trim() || msg.effectFallback(action.kind, action.name);
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
export async function runCommand(turnId: string, tabId: number | undefined, rawText: string): Promise<'handoff' | void> {
  const signal = turnSignal(turnId);
  const say = async (text: string) => { if (await ownsTurn(turnId)) await announce(tabId, text); };
  const text = rawText.trim();
  if (!text) { await say(msg.NOTHING_HEARD); return; }
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
  // The job is only a proposal until the page confirms (EXECUTING) that it is about to perform the side effect.
  let jobId = '';
  if (proposal.action === 'click' || proposal.action === 'fill') {
    const node = result.snapshot.nodes.find(n => n.id === proposal.target);
    const job: PendingEffectJob = { id: crypto.randomUUID(), turnId, tabId: tabId!, state: 'proposed', action: { kind: proposal.action, name: node ? spokenName(node) : '', role: node?.role ?? '' }, preSnapshot: result.snapshot, startedAt: Date.now() };
    jobId = job.id;
    await chrome.storage.session.set({ [JOB]: job });
  }
  let executed: ExecuteResult;
  try { executed = await chrome.tabs.sendMessage(tabId!, { type: 'EXECUTE', epoch: result.snapshot.epoch, proposal, turnId, jobId }, { frameId: 0 }); }
  catch {
    // Only an action the page proved it started can be followed by a navigation; any other delivery failure ends the turn locally.
    const job = await getJob();
    if (jobId && job?.id === jobId && job.state !== 'proposed') return 'handoff';
    if (jobId) await dropJob(jobId);
    await say(msg.ACTION_FAILED);
    return;
  }
  if (jobId) await dropJob(jobId);
  if (!(await ownsTurn(turnId))) return;
  if (!executed.ok) await say(msg.rejectionText(executed.reason));
  else if (executed.kind === 'none') await say(msg.noneSay(proposal.say));
  else await announceEffect(tabId!, { kind: executed.kind, name: executed.name, role: executed.role }, executed.diff ?? { added: [], removed: [], changed: [], alerts: [] }, signal);
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
    await announceEffect(tabId, job.action, result.diff, turnSignal(job.turnId));
  } catch { if (await ownsTurn(job.turnId)) await announce(tabId, msg.effectFallback(job.action.kind, job.action.name)); }
  finally { await runSerial(async () => { await resetTurnIf(job.turnId); await dropJob(job.id); }); }
}
