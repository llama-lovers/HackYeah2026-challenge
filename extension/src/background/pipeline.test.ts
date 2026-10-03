import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
// Minimal chrome adapter: just enough for the background pipeline's state machine.
type Handler = (tabId: number, message: any) => unknown;
const store = new Map<string, unknown>();
const sent: any[] = [];
const spoken: string[] = [];
const tabCalls: { tabId: number; message: any }[] = [];
let tabHandler: Handler = () => ({ ok: true });
const g = globalThis as any;
g.__PROXY_URL__ = 'http://localhost:8787'; g.__E2E__ = false;
g.chrome = {
  storage: { session: {
    get: async (key: string) => store.has(key) ? { [key]: structuredClone(store.get(key)) } : {},
    set: async (items: Record<string, unknown>) => { for (const [k, v] of Object.entries(items)) store.set(k, structuredClone(v)); },
    remove: async (key: string) => { store.delete(key); },
  } },
  runtime: { id: 'ext', sendMessage: async (message: any) => { sent.push(message); }, getContexts: async () => [{}], ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' }, openOptionsPage: async () => {} },
  offscreen: { createDocument: async () => {}, Reason: { USER_MEDIA: 'USER_MEDIA' } },
  tabs: { sendMessage: async (tabId: number, message: any) => { tabCalls.push({ tabId, message }); return tabHandler(tabId, message); } },
  tts: { speak: (text: string) => { spoken.push(text); } },
};
const pipeline = await import('./pipeline.ts');
const turn = () => pipeline.getTurn() as Promise<any>;
beforeEach(() => { store.clear(); sent.length = 0; spoken.length = 0; tabCalls.length = 0; tabHandler = () => ({ ok: true }); });

test('rapid shortcut presses start then stop one recording and keep its owner (CR-05)', async () => {
  await Promise.all([pipeline.handleToggle({ id: 7 } as chrome.tabs.Tab), pipeline.handleToggle({ id: 22 } as chrome.tabs.Tab)]);
  assert.deepEqual(sent.map(m => m.type), ['REC_START', 'REC_STOP']);
  const state = await turn();
  assert.equal(state.tabId, 7); assert.equal(state.phase, 'processing');
});
test('shortcuts from two tabs never create two recording owners (CR-05)', async () => {
  await Promise.all([pipeline.handleToggle({ id: 7 } as chrome.tabs.Tab), pipeline.handleToggle({ id: 22 } as chrome.tabs.Tab), pipeline.handleToggle({ id: 22 } as chrome.tabs.Tab)]);
  assert.equal(sent.filter(m => m.type === 'REC_START').length, 1);
  assert.equal((await turn()).tabId, 7);
});
test('a failed setup releases only its own reservation (CR-05)', async () => {
  tabHandler = () => { throw new Error('no content script'); };
  await pipeline.handleToggle({ id: 7, url: 'https://example.com/' } as chrome.tabs.Tab);
  assert.equal((await turn()).phase, 'idle');
  assert.equal(sent.length, 0);
  assert.equal(spoken.length, 1);
  await store.set('turn', { phase: 'recording', tabId: 9, startedAt: Date.now(), id: 'newer' });
  await pipeline.resetTurnIf('older');
  assert.equal((await turn()).id, 'newer');
});

const snapshot = { epoch: 1, path: '/', title: 'T', nodes: [], truncated: false };
const staleRecording = (id: string, tabId: number) => store.set('turn', { phase: 'recording', tabId, startedAt: Date.now() - 40000, id });
const message = (turnId: string, body: object) => ({ target: 'sw', turnId, ...body }) as any;
test('late events of a recovered turn are ignored, including on the same tab (CR-06)', async () => {
  for (const tab of [22, 7]) {
    store.clear(); sent.length = 0; tabCalls.length = 0;
    staleRecording('old', 7);
    await pipeline.handleToggle({ id: tab } as chrome.tabs.Tab);
    const replacement = await turn();
    assert.notEqual(replacement.id, 'old'); assert.equal(replacement.tabId, tab);
    assert.deepEqual(sent.map(m => [m.type, m.turnId]), [['REC_START', replacement.id]]);
    tabCalls.length = 0;
    await pipeline.handleOffscreenMessage(message('old', { type: 'TRANSCRIPT', text: 'kliknij Znajdź' }));
    await pipeline.handleOffscreenMessage(message('old', { type: 'TRANSCRIBE_ERROR', code: 'network' }));
    await pipeline.handleOffscreenMessage(message('old', { type: 'MIC_ERROR', code: 'no_device' }));
    await pipeline.handleOffscreenMessage(message('old', { type: 'REC_STOPPED' }));
    assert.deepEqual(tabCalls, []);
    assert.deepEqual(await turn(), replacement);
  }
});
test('stopping a recording refreshes the processing deadline (CR-06)', async () => {
  store.set('turn', { phase: 'recording', tabId: 7, startedAt: Date.now() - 20000, id: 'a' });
  await pipeline.handleToggle({ id: 7 } as chrome.tabs.Tab);
  const state = await turn();
  assert.equal(state.phase, 'processing'); assert(Date.now() - state.startedAt < 1000);
  assert.equal(sent[0].turnId, 'a');
});
test('stale recovery aborts the in-flight model request of the abandoned turn (CR-06)', async () => {
  tabHandler = (_tab, m) => m.type === 'SNAPSHOT' ? { ok: true, snapshot } : { ok: true };
  let aborted = false;
  g.fetch = (_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal!.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }));
  await pipeline.handleToggle({ id: 7 } as chrome.tabs.Tab);
  const first = await turn();
  const running = pipeline.handleOffscreenMessage(message(first.id, { type: 'TRANSCRIPT', text: 'kliknij Znajdź' }));
  await new Promise(resolve => setTimeout(resolve, 20));
  await store.set('turn', { ...first, startedAt: Date.now() - 40000 });
  await pipeline.handleToggle({ id: 22 } as chrome.tabs.Tab);
  await running;
  assert(aborted);
  const replacement = await turn();
  assert.equal(replacement.tabId, 22); assert.equal(replacement.phase, 'recording');
  assert.equal(tabCalls.filter(c => c.message.type === 'EXECUTE').length, 0);
  assert.equal(spoken.length, 0);
});
