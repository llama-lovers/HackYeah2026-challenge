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
const button = { id: 'e1', kind: 'interactive' as const, role: 'button', name: 'Znajdź', state: {} };
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
test('expired parcel-only replies stay local just beyond the TTL (WR-01)', async () => {
  for (const kind of ['await_parcel_number','confirm_parcel']) {
    for (const text of ['873234987612340872938732','12345678','jeden dwa trzy cztery pięć sześć siedem osiem','1234']) {
      const network = localAdapter(); tabCalls.length=0;
      store.set('pending',parcelPending({kind,createdAt:Date.now()-60001}));
      await localCommand(text);
      assert.deepEqual(announced(),['Minął czas na odpowiedź. Powiedz polecenie jeszcze raz.'],`${kind}: ${text}`);
      assert.equal(store.has('pending'),false);
      assert(!tabCalls.some(c=>['SNAPSHOT','EXECUTE'].includes(c.message.type)));
      assert.deepEqual(network,[]);
    }
  }
});
test('explicit fresh commands remain routable after parcel expiry', async () => {
  const requests:string[]=[];
  g.fetch=async(url:string)=>{requests.push(String(url));return{ok:true,json:async()=>({action:'none',target:'',text:'',needs_confirmation:false,say:'Opis strony.'})};};
  tabHandler=(_tab,m)=>m.type==='SNAPSHOT'?{ok:true,docId:'doc',snapshot:{...snapshot,nodes:[field,button]}}:m.type==='EXECUTE'?{ok:true,kind:'none'}:{ok:true};
  store.set('pending',parcelPending({kind:'await_parcel_number',createdAt:Date.now()-60001}));
  await localCommand('opisz stronę');
  assert.equal(requests.length,1); assert(requests[0]!.endsWith('/api/action'));
  assert.deepEqual(announced(),['Opis strony.']);
  requests.length=0; tabCalls.length=0;
  store.set('pending',parcelPending({kind:'await_parcel_number',createdAt:Date.now()-60001}));
  await localCommand('sprawdź status przesyłki numer 12345678');
  assert.equal((store.get('pending') as any).kind,'confirm_parcel');
  assert.equal((store.get('pending') as any).digits,'12345678');
  assert.deepEqual(requests,[]); assert(!tabCalls.some(c=>c.message.type==='EXECUTE'));
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
const emptyDiff = { added: [], removed: [], changed: [], alerts: [] };
const makeRun = (budget = { max: 3, used: 0 }) => {
  const id = crypto.randomUUID(); store.set('turn', { phase: 'processing', tabId: 7, startedAt: Date.now(), id });
  return { turnId: id, tabId: 7, signal: new AbortController().signal, budget };
};
const step = { proposal: clickProposal, epoch: 1, docId: 'doc-1', preSnapshot: { ...snapshot, nodes: [button] }, announce: 'none' as const };
test('third step executes fourth stops and every command owns a fresh budget', async () => {
  localAdapter(); tabHandler = (_tab, m) => m.type === 'EXECUTE' ? { ok: true, kind: 'click', name: 'Znajdź', role: 'button', diff: emptyDiff } : { ok: true };
  for (let command = 0; command < 2; command++) {
    const run = makeRun();
    for (let i = 0; i < 3; i++) assert.equal(await pipeline.performProposal(run, step), 'done');
    assert.equal(await pipeline.performProposal(run, step), 'stopped');
    assert.equal(run.budget.used, 3);
  }
  assert.equal(tabCalls.filter(c => c.message.type === 'EXECUTE').length, 6);
  assert.deepEqual(announced(), ['To wszystko na jedno polecenie. Powiedz, co dalej.', 'To wszystko na jedno polecenie. Powiedz, co dalej.']);
});
test('tracking uses two awaited action steps and an injected one-step budget never clicks', async () => {
  const requests = localAdapter();
  tabHandler = (_tab, m) => m.type === 'SNAPSHOT' ? { ok: true, docId: 'doc-1', snapshot: { ...snapshot, nodes: [field, button] } } : m.type === 'EXECUTE' ? { ok: true, kind: m.proposal.action, name: 'Znajdź', role: 'button', diff: emptyDiff } : m.type === 'READ_STATUS' ? { ok: true, status: { kind: 'status', title: 'W drodze', description: '349 zł. 44051401359.' } } : { ok: true };
  let run = makeRun(); await pipeline.runParcelSearch(run, '000000000000000000000001');
  assert.equal(run.budget.used, 2);
  assert.deepEqual(tabCalls.filter(c => c.message.type === 'EXECUTE').map(c => c.message.proposal.action), ['fill', 'click']);
  assert.equal(tabCalls.find(c => c.message.type === 'READ_STATUS')?.message.number, '000000000000000000000001');
  assert.deepEqual(announced(), ['Status na stronie: W drodze. 349 zł. 44051401359.']);
  tabCalls.length = 0; run = makeRun({ max: 1, used: 0 });
  await pipeline.runParcelSearch(run, '12345678');
  assert.equal(run.budget.used, 1);
  assert.deepEqual(tabCalls.filter(c => c.message.type === 'EXECUTE').map(c => c.message.proposal.action), ['fill']);
  assert.deepEqual(announced(), ['To wszystko na jedno polecenie. Powiedz, co dalej.']); assert.deepEqual(requests, []);
});
test('a rejected fill is counted and never followed by the search click', async () => {
  localAdapter(); tabHandler = (_tab, m) => m.type === 'SNAPSHOT' ? { ok: true, docId: 'doc-1', snapshot: { ...snapshot, nodes: [field, button] } } : m.type === 'EXECUTE' ? { ok: false, reason: 'sensitive_fill' } : { ok: true };
  const run = makeRun(); await pipeline.runParcelSearch(run, '12345678');
  assert.equal(run.budget.used, 1); assert.equal(tabCalls.filter(c => c.message.type === 'EXECUTE').length, 1);
  assert.deepEqual(announced(), ['Tego pola nie wypełniam, bo jest na dane poufne. Wypełnij je samodzielnie albo poproś o pomoc zaufaną osobę.']);
});
test('model effect speaks amount and date while local navigation makes no fetch', async () => {
  withProposal(clickProposal, 'Do zapłaty 349 zł do 04.10.2026.');
  await pipeline.announceEffect(7, { kind: 'click', name: 'Znajdź', role: 'button' }, { ...emptyDiff, added: ['Nowa treść'] });
  assert.deepEqual(announced(), ['Do zapłaty trzysta czterdzieści dziewięć złotych do czwartego października dwa tysiące dwudziestego szóstego roku.']);
  tabCalls.length = 0;
  const network = localAdapter(), run = makeRun();
  store.set('pendingEffect', { id: 'j', turnId: run.turnId, tabId: 7, state: 'executed', action: { kind: 'click', name: 'Znajdź', role: 'button' }, preSnapshot: snapshot, startedAt: Date.now(), effect: 'local' });
  tabHandler = (_tab, m) => m.type === 'SETTLE_DIFF' ? { ok: true, diff: { ...emptyDiff, title: { before: 'T', after: 'Wyniki' } } } : { ok: true };
  await pipeline.handleReady(7);
  assert.deepEqual(network, []); assert.deepEqual(announced(), ['Kliknąłem Znajdź. Jesteś teraz na stronie Wyniki.']);
});
test('tracking waits for fill completion and delivery failure stops before click', async () => {
  localAdapter();
  let finish!: (value: object) => void;
  tabHandler = (_tab, m) => m.type === 'SNAPSHOT' ? { ok: true, docId: 'doc-1', snapshot: { ...snapshot, nodes: [field, button] } } : m.type === 'EXECUTE' ? new Promise(resolve => { finish = resolve; }) : { ok: true };
  const run = makeRun(), work = pipeline.runParcelSearch(run, '12345678');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(tabCalls.filter(c => c.message.type === 'EXECUTE').map(c => c.message.proposal.action), ['fill']);
  finish({ ok: false, reason: 'disabled' }); await work;
  assert.equal(run.budget.used, 1); assert.equal(tabCalls.filter(c => c.message.type === 'EXECUTE').length, 1);
  assert.deepEqual(announced(), ['Ten element jest teraz nieaktywny, więc go nie użyję.']);
  tabCalls.length = 0;
  tabHandler = (_tab, m) => m.type === 'SNAPSHOT' ? { ok: true, docId: 'doc-1', snapshot: { ...snapshot, nodes: [field, button] } } : m.type === 'EXECUTE' ? (() => { throw new Error('delivery_failed'); })() : { ok: true };
  const failed = makeRun(); await pipeline.runParcelSearch(failed, '12345678');
  assert.equal(failed.budget.used, 1); assert.equal(tabCalls.filter(c => c.message.type === 'EXECUTE').length, 1);
  assert.deepEqual(announced(), ['Nie udało się wykonać tej akcji. Spróbuj jeszcze raz.']);
});
test('none actions and zero-step dialog replies are spoken without charging a step', async () => {
  localAdapter();
  tabHandler = (_tab, m) => m.type === 'EXECUTE' ? { ok: true, kind: 'none' } : { ok: true };
  const run = makeRun({ max: 0, used: 0 });
  await pipeline.performProposal(run, { ...step, proposal: { ...clickProposal, action: 'none', say: 'Nie rozumiem.' } });
  assert.equal(run.budget.used, 0); assert.deepEqual(announced(), ['Nie rozumiem.']);
  for (const [text, p, expected] of [['tak', undefined, 'Nie ma nic do potwierdzenia.'], ['nie', parcelPending(), 'Anulowałem.'], ['co innego', parcelPending(), 'Powiedz tak albo nie.']] as const) {
    tabCalls.length = 0; store.delete('pending'); if (p) store.set('pending', p);
    await localCommand(text); assert.deepEqual(announced(), [expected]); assert(!tabCalls.some(c => c.message.type === 'EXECUTE'));
  }
});
const actionPending = (extra: object = {}) => ({ kind: 'confirm_action', id: 'action-pending', tabId: 7, createdAt: Date.now(), reprompts: 0, proposal: { ...clickProposal, say: 'untrusted model text' }, epoch: 19, docId: 'original-document', preSnapshot: { ...snapshot, nodes: [button] }, name: 'Zapłać', role: 'button', category: 'irreversible', ...extra });
const ambiguousSnapshot = {...snapshot,epoch:19,nodes:[{kind:'heading',role:'heading',name:'Kraków'},{...button,name:'Usuń'},{kind:'heading',role:'heading',name:'Poznań'},{...button,id:'e2',name:'Usuń'}]};
test('captcha utterances preserve pending dialogs and never snapshot execute or fetch', async () => {
  const requests=localAdapter(); const p=actionPending(); store.set('pending',p);
  for(const text of ['zaznacz, że nie jestem robotem','rozwiąż captcha']) {
    tabCalls.length=0; await localCommand(text);
    assert.deepEqual(store.get('pending'),p);
    assert(!tabCalls.some(c=>['SNAPSHOT','EXECUTE'].includes(c.message.type))); assert.deepEqual(requests,[]);
    assert.match(announced()[0]!,/zaufaną osobę/);
  }
});
test('captcha names and hints refuse proposals including stored and chosen controls before EXECUTE', async () => {
  const s={...snapshot,nodes:[{...button,name:'Nie jestem robotem'},{...button,id:'e2',name:'Nie jestem robotem'}]};
  withProposal(clickProposal); tabHandler=(_tab,m)=>m.type==='SNAPSHOT'?{ok:true,docId:'doc',snapshot:s}:{ok:true};
  await localCommand('kliknij pierwszy'); assert(!tabCalls.some(c=>c.message.type==='EXECUTE')); assert.deepEqual(announced(),['Nie rozwiązuję zabezpieczeń captcha. Poproś o pomoc zaufaną osobę.']);
  tabCalls.length=0; const requests=localAdapter(); store.set('pending',actionPending({preSnapshot:s})); await localCommand('tak');
  assert(!tabCalls.some(c=>c.message.type==='EXECUTE')); assert.deepEqual(requests,[]);
  tabCalls.length=0; store.set('pending',{...actionPending(),kind:'choose_option',action:'click',text:'',needsConfirmation:false,preSnapshot:{...s,nodes:[{...button,hint:'reCAPTCHA'}]},options:[{id:'e1',name:'klik',role:'button'},{id:'e2',name:'klik',role:'button'}]});
  await localCommand('jeden'); assert(!tabCalls.some(c=>c.message.type==='EXECUTE'));
});
test('missing parcel status reports the captcha instead of generic failure', async () => {
  localAdapter(); const run=makeRun();
  tabHandler=(_tab,m)=>m.type==='SNAPSHOT'?{ok:true,docId:'doc',snapshot:{...snapshot,nodes:[field,button]}}:m.type==='EXECUTE'?{ok:true,kind:m.proposal.action,name:'Znajdź',role:'button',diff:emptyDiff}:m.type==='READ_STATUS'?{ok:false,error:'not_found',captcha:true}:{ok:true};
  await pipeline.runParcelSearch(run,'12345678');
  assert.deepEqual(announced(),['Strona pokazuje zabezpieczenie captcha. Nie rozwiązuję go. Poproś o pomoc zaufaną osobę.']);
});
test('expired numbered choice never replans the reply or executes a stale selection', async () => {
  const requests=localAdapter();
  store.set('pending',{...actionPending({createdAt:Date.now()-61000}),kind:'choose_option',action:'click',text:'',needsConfirmation:false,options:[{id:'e1',name:'Usuń',role:'button'},{id:'e2',name:'Usuń',role:'button'}]});
  await localCommand('dwa');
  assert.deepEqual(announced(),['Minął czas na odpowiedź. Powiedz polecenie jeszcze raz.']);
  assert.equal(store.has('pending'),false); assert(!tabCalls.some(c=>['SNAPSHOT','EXECUTE'].includes(c.message.type))); assert.deepEqual(requests,[]);
});
test('duplicate model target asks without execution then chooses stored target into contextual confirmation', async () => {
  const requests: string[] = [];
  g.fetch = async (url: string) => {requests.push(String(url));return {ok:true,json:async()=>clickProposal};};
  tabHandler = (_tab,m) => m.type==='SNAPSHOT' ? {ok:true,docId:'original-document',snapshot:ambiguousSnapshot} : m.type==='EXECUTE' ? {ok:false,reason:'irreversible',confirm:{name:'Usuń',role:'button',category:'irreversible'}} : {ok:true};
  await localCommand('kliknij Usuń');
  assert.equal(tabCalls.filter(c=>c.message.type==='EXECUTE').length,0);
  const p = store.get('pending') as any; assert.equal(p.kind,'choose_option');
  assert.deepEqual(announced(),['Pasuje kilka elementów. Jeden: Usuń, Kraków. Dwa: Usuń, Poznań. Który? Powiedz numer.']);
  tabCalls.length=0; requests.length=0; await localCommand('dwa');
  const execution = tabCalls.find(c=>c.message.type==='EXECUTE')!.message;
  assert.equal(execution.proposal.target,'e2'); assert.equal(execution.epoch,19); assert.equal(execution.docId,'original-document');
  assert.equal(execution.context, 'Poznań');
  assert(!tabCalls.some(c=>c.message.type==='SNAPSHOT')); assert.deepEqual(requests,[]);
  assert.deepEqual(announced(),['Chcę kliknąć „Usuń”, Poznań. Potwierdzasz? Powiedz tak albo nie.']);
  assert.equal((store.get('pending') as any).kind,'confirm_action');
  tabCalls.length=0; await localCommand('tak');
  const confirmed = tabCalls.find(c=>c.message.type==='EXECUTE')!.message;
  assert.equal(confirmed.confirmed,true); assert.equal(confirmed.context,'Poznań');
});
test('model choose rejects fewer than two valid IDs and carries confirmation flag to exact stored reply', async () => {
  const s = {...snapshot,epoch:9,nodes:[button,{...button,id:'e2',name:'Pomoc'},{...button,id:'e3',state:{disabled:true}},{...button,id:'e4',kind:'text'},{...button,id:'e5',role:'textbox'}]};
  tabHandler = (_tab,m) => m.type==='SNAPSHOT' ? {ok:true,docId:'doc-choice',snapshot:s} : m.type==='EXECUTE' ? {ok:false,reason:'needs_confirmation',confirm:{name:'Pomoc',role:'button',category:'model_flag'}} : {ok:true};
  for(const id of ['unknown','e1','e3','e4','e5','']) {
    withProposal({...clickProposal,action:'choose',target:'',option_1:'e1',option_2:id});
    tabCalls.length=0; await localCommand('kliknij coś');
    assert.deepEqual(announced(),['Nie jestem pewien, o który element chodzi. Powiedz polecenie dokładniej.']);
    assert.equal(store.has('pending'),false); assert(!tabCalls.some(c=>c.message.type==='EXECUTE'));
  }
  withProposal({...clickProposal,action:'choose',target:'',option_1:'e1',option_2:'e2',needs_confirmation:true});
  await localCommand('kliknij coś');
  const requests=localAdapter(); tabCalls.length=0; await localCommand('numer dwa');
  const execution=tabCalls.find(c=>c.message.type==='EXECUTE')!.message;
  assert.equal(execution.proposal.needs_confirmation,true); assert.equal(execution.proposal.target,'e2');
  assert.equal(execution.epoch,9); assert.equal(execution.docId,'doc-choice');
  assert(!tabCalls.some(c=>c.message.type==='SNAPSHOT')); assert.deepEqual(requests,[]);
});
test('unique model target executes directly without a numbered question', async () => {
  withProposal(clickProposal); tabHandler = (_tab,m) => m.type==='SNAPSHOT' ? {ok:true,docId:'doc',snapshot:{...snapshot,nodes:[button]}} : m.type==='EXECUTE' ? {ok:true,kind:'click',name:'Znajdź',role:'button',diff:emptyDiff} : {ok:true};
  await localCommand('kliknij Znajdź'); assert.equal(tabCalls.filter(c=>c.message.type==='EXECUTE').length,1); assert.equal(store.has('pending'),false);
});
test('confirmed action uses exactly the stored proposal document and epoch with no snapshot or fetch', async () => {
  const requests = localAdapter(); const p = actionPending(); store.set('pending', p);
  tabHandler = (_tab, m) => m.type === 'EXECUTE' ? { ok: true, kind: 'click', name: 'Zapłać', role: 'button', diff: { ...emptyDiff, added: ['Zapłacono'] } } : { ok: true };
  await localCommand('tak');
  const executions = tabCalls.filter(c => c.message.type === 'EXECUTE'); assert.equal(executions.length, 1); assert(executions[0]);
  assert.deepEqual(executions[0].message.proposal, p.proposal);
  assert.equal(executions[0].message.epoch, p.epoch); assert.equal(executions[0].message.docId, p.docId);
  assert.equal(executions[0].message.confirmed, true);
  assert(!tabCalls.some(c => c.message.type === 'SNAPSHOT')); assert.deepEqual(requests, []);
  assert.deepEqual(announced(), ['Kliknąłem Zapłać. Na stronie pojawiło się: Zapłacono.']);
  assert.equal(store.has('pending'), false);
  tabCalls.length = 0; await localCommand('tak');
  assert.deepEqual(announced(), ['Nie ma nic do potwierdzenia.']); assert(!tabCalls.some(c => c.message.type === 'EXECUTE'));
});
test('action confirmation expires and never executes on another tab or a closed tab', async () => {
  const requests = localAdapter();
  for (const [extra, expected] of [[{ createdAt: Date.now() - 61000 }, 'Minął czas na odpowiedź. Powiedz polecenie jeszcze raz.'], [{ tabId: 9 }, 'Nie ma nic do potwierdzenia.']] as const) {
    tabCalls.length = 0; store.set('pending', actionPending(extra)); await localCommand('tak');
    assert.deepEqual(announced(), [expected]); assert.equal(store.has('pending'), false); assert(!tabCalls.some(c => c.message.type === 'EXECUTE'));
  }
  store.set('pending', actionPending()); await pipeline.handleTabRemoved(7); assert.equal(store.has('pending'), false);
  assert.deepEqual(requests, []);
});
test('action confirmation cancels for no and cancel and reprompts once for unrelated speech', async () => {
  const requests = localAdapter();
  for (const text of ['nie', 'anuluj']) {
    tabCalls.length = 0; store.set('pending', actionPending()); await localCommand(text);
    assert.deepEqual(announced(), ['Anulowałem.']); assert.equal(store.has('pending'), false);
  }
  tabCalls.length = 0; store.set('pending', actionPending());
  await localCommand('sprawdź status przesyłki 12345678');
  assert.equal((store.get('pending') as any).reprompts, 1);
  await localCommand('cokolwiek'); assert.equal(store.has('pending'), false);
  assert.deepEqual(announced(), ['Powiedz tak albo nie.', 'Anulowałem.']);
  assert(!tabCalls.some(c => c.message.type === 'EXECUTE' || c.message.type === 'SNAPSHOT')); assert.deepEqual(requests, []);
});
test('concurrent action replies consume the pending proposal at most once', async () => {
  const requests = localAdapter(), run = makeRun(); store.set('pending', actionPending());
  tabHandler = (_tab, m) => m.type === 'EXECUTE' ? { ok: true, kind: 'click', name: 'Zapłać', role: 'button', diff: emptyDiff } : { ok: true };
  await Promise.all([pipeline.runCommand(run.turnId, 7, 'tak'), pipeline.runCommand(run.turnId, 7, 'tak')]);
  assert.equal(tabCalls.filter(c => c.message.type === 'EXECUTE').length, 1); assert.equal(store.has('pending'), false); assert.deepEqual(requests, []);
});
test('stale execution never writes an action confirmation for the replacement owner', async () => {
  localAdapter(); const run = makeRun();
  tabHandler = (_tab, m) => {
    if (m.type === 'EXECUTE') { store.set('turn', { phase: 'processing', tabId: 7, id: 'replacement', startedAt: Date.now() }); return { ok: false, reason: 'irreversible', confirm: { name: 'Zapłać', role: 'button', category: 'irreversible' } }; }
    return { ok: true };
  };
  assert.equal(await pipeline.performProposal(run, step), 'stopped');
  assert.equal(store.has('pending'), false); assert.deepEqual(announced(), []);
});
test('superseded reply cannot consume the replacement owners confirmation', async () => {
  const requests = localAdapter(); const p = actionPending(); store.set('pending', p);
  makeRun(); await pipeline.runCommand('superseded', 7, 'tak');
  assert.deepEqual(store.get('pending'), p);
  assert(!tabCalls.some(c => c.message.type === 'EXECUTE')); assert.deepEqual(requests, []);
});
test('confirmation stores DOM name and exact proposal while withholding the click', async () => {
  localAdapter(); const run = makeRun();
  tabHandler = (_tab, m) => m.type === 'EXECUTE' ? { ok: false, reason: 'irreversible', confirm: { name: 'Zapłać', role: 'button', category: 'irreversible' } } : { ok: true };
  await pipeline.performProposal(run, step);
  const pending = store.get('pending') as any;
  assert.equal(pending.kind, 'confirm_action'); assert.deepEqual(pending.proposal, step.proposal);
  assert.equal(pending.docId, step.docId); assert.equal(pending.epoch, step.epoch); assert.deepEqual(pending.preSnapshot, step.preSnapshot);
  assert.deepEqual(announced(), ['Chcę kliknąć „Zapłać”. Potwierdzasz? Powiedz tak albo nie.']);
});
