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
