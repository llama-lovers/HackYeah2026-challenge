import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { launchChromium, connect, openPage, waitForTarget, attach, evaluate, waitFor, EXT_DIR } from '../cdp.mjs';

const root = resolve(EXT_DIR, '..');
const here = fileURLToPath(new URL('.', import.meta.url));
const allCases = JSON.parse(await readFile(resolve(here, 'cases.json'), 'utf8'));
const selected = process.argv.slice(2);
const cases = allCases.filter(test => !selected.length || selected.includes(test.id));
assert(cases.length && selected.every(id => cases.some(test => test.id === id)), 'Unknown test selection');
process.env.CHROMIUM_BIN ||= resolve(root, 'test-artifacts/inpost/tools/chrome-win64/chrome.exe');
const output = resolve(root, 'test-artifacts/inpost/run-' + new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const build = spawnSync(process.execPath, ['scripts/build.mjs'], {
  cwd: EXT_DIR, encoding: 'utf8', env: { ...process.env, E2E: '1', OUT_DIR: 'dist-e2e', PROXY_URL: 'http://localhost:8787' },
});
assert.equal(build.status, 0, build.stderr || build.stdout);
assert((await fetch('http://127.0.0.1:8787/health')).ok, 'Start the real backend first');
const extensionId = spawnSync(process.execPath, ['scripts/gen-key.mjs', '--id', 'static/manifest.json'], { cwd: EXT_DIR, encoding: 'utf8' }).stdout.trim();
const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

function wavDuration(bytes) {
  let byteRate, size;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(offset + 4);
    const tag = bytes.toString('ascii', offset, offset + 4);
    if (tag === 'fmt ') byteRate = bytes.readUInt32LE(offset + 16);
    if (tag === 'data') size = length;
    offset += 8 + length + length % 2;
  }
  assert(byteRate && size, 'Invalid WAV fixture');
  return size / byteRate;
}

const pageState = `(() => {
  const visible=e=>e.checkVisibility() && e.getBoundingClientRect().width>0;
  return {url:location.href,title:document.title,
    parcel:document.querySelector('#inputForMat')?.value ?? null,
    parcelFormText:document.querySelector('#inputForMat')?.closest('form')?.innerText ?? '',
    parcelRules:(()=>{const e=document.querySelector('#inputForMat');return e ? {minLength:e.minLength,maxLength:e.maxLength,pattern:e.pattern,valid:e.validity.valid} : null})(),
    findButton:(()=>{const e=document.querySelector('#inputForMat')?.closest('form')?.querySelector('button');return e ? {disabled:e.disabled,ariaDisabled:e.getAttribute('aria-disabled'),classes:e.className} : null})(),
    searchFields:[...document.querySelectorAll('input')].filter(e=>visible(e) && /szukaj/i.test([e.placeholder,e.getAttribute('aria-label')].join(' '))).map(e=>({id:e.id,value:e.value})),
    headings:[...document.querySelectorAll('h1,h2')].filter(visible).map(e=>e.textContent.trim()),
    live:document.getElementById('voice-agent-live-region')?.textContent ?? '',
    maintenance:/prace serwisowe|przerwa serwisowa/i.test(document.body.innerText)};
})()`;

for (const test of cases) {
  const started = Date.now();
  const record = { id: test.id, text: test.text, expected: test.expected, status: 'FAIL' };
  const dir = resolve(output, test.id);
  await mkdir(dir, { recursive: true });
  let browser, client, page, swEval, offscreenEval;
  try {
    const wavPath = resolve(root, 'test-artifacts/inpost/audio', test.id + '.wav');
    record.audio = wavPath;
    record.audioSeconds = wavDuration(await readFile(wavPath));
    browser = await launchChromium({ userDataDir: resolve(dir, 'profile'), extensionDir: resolve(EXT_DIR, 'dist-e2e'),
      extraArgs: ['--window-size=1440,1000', '--mute-audio', `--use-file-for-fake-audio-capture=${wavPath}%noloop`] });
    client = await connect(browser.port);
    page = await openPage(client, 'https://inpost.pl/');
    await client.send('Page.bringToFront', {}, page.sessionId);
    await waitFor(() => page.evaluate("!!document.getElementById('voice-agent-live-region')"), { label: 'extension content loaded' });
    await sleep(2000);
    const sw = await waitForTarget(browser.port, t=>t.type==='service_worker' && t.url===`chrome-extension://${extensionId}/background/sw.js`);
    const swSession = await attach(client, sw.id);
    swEval = expression => evaluate(client, swSession, expression);
    // Observe actual responses/events; no transcript, action, or provider is mocked.
    await swEval(`(() => {
      globalThis.__evidence={api:[],events:[],announcements:[],executions:[]};
      const originalFetch=globalThis.fetch.bind(globalThis);
      globalThis.fetch=async (...args)=>{
        const response=await originalFetch(...args);
        const path=new URL(String(args[0])).pathname;
        if(path.startsWith('/api/')) {
          const body=await response.clone().json().catch(()=>null);
          __evidence.api.push({path,status:response.status,body});
        }
        return response;
      };
      chrome.runtime.onMessage.addListener(message=>{
        if(message.target==='sw') __evidence.events.push(message);
      });
      const send=chrome.tabs.sendMessage.bind(chrome.tabs);
      chrome.tabs.sendMessage=(tabId,message,...rest)=>{
        if(message.type==='ANNOUNCE') __evidence.announcements.push(message.text);
        if(message.type==='EXECUTE') __evidence.executions.push(message.proposal);
        return send(tabId,message,...rest);
      };
    })()`);
    record.before = await page.evaluate(pageState);
    assert.equal(record.before.parcel, '', 'Expected an empty parcel field');
    const screenshotBefore = await client.send('Page.captureScreenshot', {}, page.sessionId);
    await writeFile(resolve(dir, 'before.png'), Buffer.from(screenshotBefore.data, 'base64'));
    await swEval('globalThis.__voiceAgentTest.toggle()');
    await waitFor(()=>swEval("__evidence.events.some(e=>e.type==='MIC_OPEN')"), {timeoutMs:10000,label:'microphone opened'});
    const offscreen = await waitForTarget(browser.port, t=>t.url===`chrome-extension://${extensionId}/offscreen/offscreen.html`);
    const offSession = await attach(client, offscreen.id);
    offscreenEval = expression => evaluate(client, offSession, expression);
    await offscreenEval(`(() => {
      globalThis.__uploads=[];
      const original=globalThis.fetch.bind(globalThis);
      globalThis.fetch=async(url,options)=>{
        const response=await original(url,options);
        __uploads.push({path:new URL(String(url)).pathname,status:response.status,
          audioType:options.body?.type,audioBytes:options.body?.size,
          body:await response.clone().json().catch(()=>null)});
        return response;
      };
    })()`);
    await sleep(Math.ceil(record.audioSeconds * 1000) + 300);
    await swEval('globalThis.__voiceAgentTest.toggle()');
    await waitFor(async()=> (await swEval('globalThis.__voiceAgentTest.state()')).phase==='idle', {timeoutMs:60000,label:'completed agent turn'});
    await waitFor(()=>page.evaluate("document.readyState==='complete'"),{timeoutMs:15000,label:'destination loaded'});
    record.after = await page.evaluate(pageState);
    record.evidence = await swEval('__evidence');
    record.uploads = await offscreenEval('__uploads');
    const transcript = record.evidence.events.find(e=>e.type==='TRANSCRIPT');
    record.transcript = transcript?.text;
    assert(transcript, 'No transcript returned by the audio pipeline');
    assert(record.uploads.some(u=>u.path==='/api/transcribe' && u.status===200), 'STT HTTP request did not succeed');
    assert(!record.evidence.api.some(a=>a.status>=400), 'Model API returned an error');
    const announcements = record.evidence.announcements.join(' ');
    switch (test.id) {
      case 'silence':
        assert.equal(record.transcript, '');
        assert.match(announcements, /Nic nie usłyszałem/);
        assert.equal(record.evidence.executions.length, 0);
        break;
      case 'missing-button':
        assert.match(record.transcript, /jednorożec/i);
        assert(!record.evidence.executions.some(e=>['click','fill'].includes(e.action)), 'Unexpected page action');
        assert.match(announcements, /nie (widzę|znalaz|ma)|brak/i);
        break;
      case 'invalid-parcel':
        assert.match(announcements, /cyfr|numer.*(krótki|nieprawidłowy|długi)/i);
        assert.equal(record.evidence.executions.length, 0);
        break;
      case 'fill-parcel':
        assert.equal(record.after.parcel, '78901234');
        assert.equal(record.after.url, record.before.url, 'Fill must not submit the form');
        break;
      case 'fill-parcel-24':
        assert.equal(record.after.parcel, '123456789012345678901234');
        assert.equal(record.after.url, record.before.url, 'Fill must not submit the form');
        break;
      case 'search-navigation':
        assert(new URL(record.after.url).pathname === '/szukaj' || (!record.before.searchFields.length && record.after.searchFields.length), 'Search page/field did not open');
        break;
      case 'pricing-navigation':
        assert.equal(new URL(record.after.url).pathname, '/cenniki');
        break;
    }
    if (['silence','missing-button','invalid-parcel'].includes(test.id)) {
      assert.equal(record.after.url, record.before.url);
      assert.equal(record.after.parcel, record.before.parcel);
    }
    record.status = 'PASS';
  } catch (error) { record.error = error.message; }
  finally {
    if (page) {
      record.after ??= await page.evaluate(pageState).catch(()=>null);
      const shot = await client.send('Page.captureScreenshot', {}, page.sessionId).catch(()=>null);
      if(shot) await writeFile(resolve(dir,'after.png'),Buffer.from(shot.data,'base64'));
    }
    if(swEval) record.evidence ??= await swEval('__evidence').catch(()=>null);
    if(offscreenEval) record.uploads ??= await offscreenEval('__uploads').catch(()=>null);
    if(client) { await client.send('Browser.close').catch(()=>{}); client.close(); }
    await browser?.close();
    record.durationMs = Date.now() - started;
    await writeFile(resolve(dir,'result.json'),JSON.stringify(record,null,2));
    results.push(record);
    console.log(`${record.status} ${test.id}: ${record.error || 'expected page state verified'} (${record.durationMs} ms)`);
  }
}
await writeFile(resolve(output,'results.json'),JSON.stringify(results,null,2));
await writeFile(resolve(root,'test-artifacts/inpost/latest-run.txt'),output);
console.log(`Results: ${output}`);
console.log(`Passed ${results.filter(r=>r.status==='PASS').length}/${results.length}`);
if(results.some(r=>r.status!=='PASS')) process.exitCode=1;
