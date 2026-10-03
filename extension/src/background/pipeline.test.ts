import test, { beforeEach, mock } from 'node:test';
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
  tabHandler = (_tab, m) => m.type === 'SNAPSHOT' ? { ok: true, docId: 'doc-1', snapshot } : { ok: true };
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

// Drives one full turn up to the model proposal; returns the turn id.
const button = { id: 'e1', kind: 'interactive', role: 'button', name: 'Znajdź', state: {} };
const withProposal = (proposal: object, effect = 'Kliknąłem Znajdź. Status: w drodze.') => {
  g.fetch = async (url: string) => ({ ok: true, json: async () => String(url).endsWith('/api/effect') ? { say: effect } : proposal });
};
const clickProposal = { action: 'click', target: 'e1', text: '', needs_confirmation: false, say: '' };
const announced = () => tabCalls.filter(c => c.message.type === 'ANNOUNCE').map(c => c.message.text as string);
async function startTurn(onExecute: (tabId: number, message: any) => unknown) {
  tabHandler = (tabId, m) => m.type === 'SNAPSHOT' ? { ok: true, docId: 'doc-1', snapshot: { ...snapshot, nodes: [button] } } : m.type === 'EXECUTE' ? onExecute(tabId, m) : m.type === 'SETTLE_DIFF' ? { ok: true, diff: { added: ['Status: w drodze'], removed: [], changed: [], alerts: [] } } : { ok: true };
  await pipeline.handleToggle({ id: 7 } as chrome.tabs.Tab);
  const state = await turn();
  await pipeline.handleToggle({ id: 7 } as chrome.tabs.Tab);
  return state.id as string;
}
const job = () => (store.get('pendingEffect') as any);
test('delivery failure before execution neither claims a job nor asserts a click (CR-07)', async () => {
  withProposal(clickProposal);
  const id = await startTurn(() => { throw new Error('no receiver'); });
  await pipeline.handleOffscreenMessage(message(id, { type: 'TRANSCRIPT', text: 'kliknij Znajdź' }));
  await pipeline.handleReady(7);
  assert.equal(job(), undefined);
  assert.equal((await turn()).phase, 'idle');
  assert(announced().includes('Nie udało się wykonać tej akcji. Spróbuj jeszcze raz.'));
  assert(!announced().some(t => t.startsWith('Kliknąłem')));
});
test('a reload during the announcement delay is not reported as a click (CR-07)', async () => {
  withProposal(clickProposal);
  const id = await startTurn(async tabId => { await pipeline.handleReady(tabId); throw new Error('port closed'); });
  await pipeline.handleOffscreenMessage(message(id, { type: 'TRANSCRIPT', text: 'kliknij Znajdź' }));
  assert(!announced().some(t => t.startsWith('Kliknąłem') || t.startsWith('Wykonałem')));
  assert.equal(job(), undefined); assert.equal((await turn()).phase, 'idle');
  assert(!tabCalls.some(c => c.message.type === 'SETTLE_DIFF'));
});
test('an executed navigation is handed off and described on the next document (CR-07)', async () => {
  withProposal(clickProposal);
  const id = await startTurn(async tabId => { assert.equal(await pipeline.handleExecuting(tabId, { turnId: id, jobId: job().id }), true); throw new Error('port closed'); });
  await pipeline.handleOffscreenMessage(message(id, { type: 'TRANSCRIPT', text: 'kliknij Znajdź' }));
  assert.equal(job().state, 'executed'); assert.equal((await turn()).phase, 'processing');
  await pipeline.handleReady(7);
  assert(announced().includes('Kliknąłem Znajdź. Status: w drodze.'));
  assert.equal(job(), undefined); assert.equal((await turn()).phase, 'idle');
});
test('the page cannot confirm an action for another turn, tab or job (CR-07)', async () => {
  withProposal(clickProposal);
  let probes: boolean[] = [];
  const id = await startTurn(async tabId => {
    const j = job();
    probes = [await pipeline.handleExecuting(tabId + 1, { turnId: id, jobId: j.id }), await pipeline.handleExecuting(tabId, { turnId: 'other', jobId: j.id }), await pipeline.handleExecuting(tabId, { turnId: id, jobId: 'other' })];
    return { ok: false, reason: 'unconfirmed' };
  });
  await pipeline.handleOffscreenMessage(message(id, { type: 'TRANSCRIPT', text: 'kliknij Znajdź' }));
  assert.deepEqual(probes, [false, false, false]);
  assert(announced().includes('Nie udało się wykonać tej akcji. Spróbuj jeszcze raz.'));
});
test('an executed job that never gets a READY expires with an explicit uncertainty announcement (CR-08)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    withProposal(clickProposal);
    const id = await startTurn(async tabId => { await pipeline.handleExecuting(tabId, { turnId: id, jobId: job().id }); throw new Error('port closed'); });
    await pipeline.handleOffscreenMessage(message(id, { type: 'TRANSCRIPT', text: 'kliknij Znajdź' }));
    assert.equal((await turn()).phase, 'processing');
    mock.timers.tick(15000);
    await pipeline.runSerial(async () => {});
    assert.equal(job(), undefined); assert.equal((await turn()).phase, 'idle');
    assert(announced().some(t => t.startsWith('Wykonałem polecenie, ale nie mogę potwierdzić')));
  } finally { mock.timers.reset(); }
});
test('closing the owning tab removes the job and releases the turn (CR-08)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    withProposal(clickProposal);
    const id = await startTurn(async tabId => { await pipeline.handleExecuting(tabId, { turnId: id, jobId: job().id }); throw new Error('port closed'); });
    await pipeline.handleOffscreenMessage(message(id, { type: 'TRANSCRIPT', text: 'kliknij Znajdź' }));
    await pipeline.handleTabRemoved(7);
    assert.equal(job(), undefined); assert.equal((await turn()).phase, 'idle');
    mock.timers.tick(15000); await pipeline.runSerial(async () => {});
    assert(!announced().some(t => t.startsWith('Wykonałem')));
  } finally { mock.timers.reset(); }
});
test('a none proposal fails locally and releases the turn without any job (CR-08)', async () => {
  withProposal({ action: 'none', target: '', text: '', needs_confirmation: false, say: 'Nie rozumiem.' });
  const id = await startTurn(() => ({ ok: true, kind: 'none' }));
  await pipeline.handleOffscreenMessage(message(id, { type: 'TRANSCRIPT', text: 'abc' }));
  assert.equal(job(), undefined); assert.equal((await turn()).phase, 'idle');
  assert(announced().includes('Nie rozumiem.'));
});
test('EXECUTE is bound to the document that produced the snapshot (CR-09)', async () => {
  withProposal(clickProposal);
  let executeMessage: any;
  const id = await startTurn((_tab, m) => { executeMessage = m; return { ok: true, kind: 'none' }; });
  await pipeline.handleOffscreenMessage(message(id, { type: 'TRANSCRIPT', text: 'kliknij Znajdź' }));
  assert.equal(executeMessage.docId, 'doc-1');
});
const field = { kind: 'interactive', id: 'e2', role: 'textbox', name: 'Enter parcel numbers separated by commas', hint: 'Wpisz numer przesyłki' };
function localAdapter(nodes: any[] = [field, button]) {
  const requests: string[] = [];
  g.fetch = async (url: string) => { requests.push(String(url)); throw new Error('unexpected network'); };
  tabHandler = (_tab, m) => m.type === 'SNAPSHOT' ? { ok: true, docId: 'doc-1', snapshot: { ...snapshot, nodes } } : { ok: true };
  return requests;
}
async function localCommand(text: string, tabId = 7) {
  const id = crypto.randomUUID();
  store.set('turn', { phase: 'processing', tabId, startedAt: Date.now(), id });
  return pipeline.runCommand(id, tabId, text);
}
const parcelPending = (extra: object = {}) => ({ kind: 'confirm_parcel', digits: '12345678', id: 'p', tabId: 7, createdAt: Date.now(), reprompts: 0, ...extra });
test('yes with no pending dialog speaks locally without snapshot or network', async () => {
  const network = localAdapter(); await localCommand('tak');
  assert.deepEqual(announced(), ['Nie ma nic do potwierdzenia.']);
  assert.deepEqual(network, []); assert.equal(tabCalls.length, 1);
});
test('expired confirmation cannot execute and speaks expiry', async () => {
  const network = localAdapter(); store.set('pending', parcelPending({ createdAt: Date.now() - 60001 }));
  await localCommand('tak');
  assert.deepEqual(announced(), ['Minął czas na odpowiedź. Powiedz polecenie jeszcze raz.']);
  assert.deepEqual(network, []); assert(!tabCalls.some(c => c.message.type === 'EXECUTE'));
  assert.equal(store.has('pending'), false);
});
test('pending belongs to its tab and is removed when that tab closes', async () => {
  localAdapter(); store.set('pending', parcelPending({ tabId: 9 }));
  await localCommand('tak'); assert.equal(store.has('pending'), false);
  assert.deepEqual(announced(), ['Nie ma nic do potwierdzenia.']);
  store.set('pending', parcelPending()); await pipeline.handleTabRemoved(7); assert.equal(store.has('pending'), false);
});
test('confirmation reprompts once then cancels with no execution', async () => {
  localAdapter(); store.set('pending', parcelPending());
  await localCommand('co innego'); assert.equal((store.get('pending') as any).reprompts, 1);
  await localCommand('co innego'); assert.equal(store.has('pending'), false);
  assert.deepEqual(announced(), ['Powiedz tak albo nie.', 'Anulowałem.']);
});
test('number-only reply enters readback while wrong page stores no confirmation', async () => {
  const network = localAdapter();
  await localCommand('sprawdź status przesyłki');
  assert.equal((store.get('pending') as any).kind, 'await_parcel_number');
  assert.deepEqual(announced(), ['Podaj numer przesyłki.']);
  await localCommand('1234 5678');
  assert.equal((store.get('pending') as any).digits, '12345678');
  assert.deepEqual(network, []);
  localAdapter([]); store.delete('pending'); tabCalls.length = 0;
  await localCommand('sprawdź status przesyłki numer 12345678');
  assert.equal(store.has('pending'), false);
  assert.deepEqual(announced(), ['Na tej stronie nie ma pola numeru przesyłki. Otwórz stronę śledzenia przesyłek InPost.']);
});
