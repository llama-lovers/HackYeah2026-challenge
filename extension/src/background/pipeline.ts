import { SESSION_KEYS } from '../shared/protocol.ts';
import type { FromOffscreen, SnapshotResult, ExecuteResult, ExecutedAction, EffectResponse } from '../shared/protocol.ts';
import type { PageDiff } from '../shared/snapshot-format.ts';
import { isEmptyDiff } from '../shared/diff.ts';
import type { Proposal } from '../shared/validate.ts';
import { onToggle, isStale } from '../shared/turn.ts';
import type { TurnState } from '../shared/turn.ts';
import { maskText } from '../shared/mask.ts';
import { toModelText } from '../shared/snapshot-format.ts';
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
export async function announceEffect(tabId: number, action: ExecutedAction, diff: PageDiff): Promise<void> {
  if (isEmptyDiff(diff)) { await announce(tabId, msg.noChange(action.kind, action.name)); return; }
  let text: string;
  try {
    const reply = await postJson<EffectResponse>('/api/effect', { action, diff }, 12000);
    text = reply.say.trim() || msg.effectFallback(action.kind, action.name);
  } catch { text = msg.effectFallback(action.kind, action.name); }
  await announce(tabId, text);
}
export async function handleToggle(tab: chrome.tabs.Tab, opts?: { stubText?: string }): Promise<void> {
  if (tab.id === undefined) return;
  const state = await getTurn();
  const { next, effect } = onToggle(state, tab.id, Date.now());
  if (effect === 'busy') { await announce(tab.id, msg.BUSY); return; }
  if (effect === 'start') {
    if (!(await ping(tab.id))) {
      speakTts(isSupportedUrl(tab.url) ? msg.RELOAD_PAGE : msg.ONLY_INPOST);
      if (isStale(state, Date.now())) await resetTurn();
      return;
    }
    if (__E2E__ && opts?.stubText !== undefined) next.stubText = opts.stubText;
    await setTurn(next);
    try { await ensureOffscreen(); await chrome.runtime.sendMessage({ target: 'offscreen', type: 'REC_START' }); }
    catch { await announce(tab.id, msg.MIC_NO_DEVICE); await resetTurn(); }
  } else {
    await setTurn(next);
    try { await chrome.runtime.sendMessage({ target: 'offscreen', type: 'REC_STOP', ...(__E2E__ && state.stubText !== undefined ? { stubText: state.stubText } : {}) }); }
    catch { await announce(state.tabId, msg.STT_FAILED); await resetTurn(); }
  }
}
export async function handleOffscreenMessage(message: FromOffscreen): Promise<void> {
  const turn = await getTurn();
  switch (message.type) {
    case 'MIC_OPEN': await announce(turn.tabId, msg.LISTENING); break;
    case 'REC_STOPPED':
      if (turn.phase === 'recording') await setTurn({ ...turn, phase: 'processing', startedAt: Date.now() });
      await announce(turn.tabId, msg.PROCESSING); break;
    case 'MIC_ERROR':
      await announce(turn.tabId, message.code === 'not_allowed' ? msg.MIC_DENIED : msg.MIC_NO_DEVICE);
      if (message.code === 'not_allowed') await chrome.runtime.openOptionsPage().catch(() => {});
      await resetTurn(); break;
    case 'TRANSCRIBE_ERROR': await announce(turn.tabId, msg.STT_FAILED); await resetTurn(); break;
    case 'TRANSCRIPT':
      try { await runCommand(turn.tabId, message.text); } finally { await resetTurn(); }
  }
}
export async function runCommand(tabId: number | undefined, rawText: string): Promise<void> {
  const text = rawText.trim();
  if (!text) { await announce(tabId, msg.NOTHING_HEARD); return; }
  let result: SnapshotResult;
  try {
    if (tabId === undefined) throw new Error('no_tab');
    result = await chrome.tabs.sendMessage(tabId, { type: 'SNAPSHOT' }, { frameId: 0 });
    if (!result.ok) throw new Error('snapshot_failed');
  } catch { await announce(tabId, msg.SNAPSHOT_FAILED); return; }
  let proposal: Proposal;
  try {
    const utterance = Array.from(maskText(text)).slice(0, 500).join('');
    proposal = await postJson('/api/action', { utterance, snapshot: toModelText(result.snapshot) }, 20000);
  } catch (error) { await announce(tabId, error instanceof EgressBlockedError ? msg.SNAPSHOT_FAILED : msg.ASSISTANT_FAILED); return; }
  let executed: ExecuteResult;
  try { executed = await chrome.tabs.sendMessage(tabId!, { type: 'EXECUTE', epoch: result.snapshot.epoch, proposal }, { frameId: 0 }); }
  catch { return; }
  if (!executed.ok) await announce(tabId, msg.rejectionText(executed.reason));
  else if (executed.kind === 'none') await announce(tabId, msg.noneSay(proposal.say));
  else await announceEffect(tabId!, { kind: executed.kind, name: executed.name, role: executed.role }, executed.diff ?? { added: [], removed: [], changed: [], alerts: [] });
}
