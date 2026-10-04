import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { launchChromium, connect, openPage, waitForTarget, attach, evaluate, waitFor, EXT_DIR, REPO_ROOT } from '../cdp.mjs';

process.env.CHROMIUM_BIN ||= resolve(REPO_ROOT, 'test-artifacts/inpost/tools/chrome-win64/chrome.exe');
const output = resolve(REPO_ROOT, 'test-artifacts/google-live/run-' + new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: EXT_DIR, encoding: 'utf8', env: { ...process.env, E2E: '1', OUT_DIR: 'dist-e2e', PROXY_URL: 'http://localhost:8787' } });
assert.equal(build.status, 0, build.stderr);
assert((await fetch('http://127.0.0.1:8787/health')).ok);
const extensionId = spawnSync(process.execPath, ['scripts/gen-key.mjs', '--id', 'static/manifest.json'], { cwd: EXT_DIR, encoding: 'utf8' }).stdout.trim();
function duration(bytes) {
  let rate, size;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = bytes.readUInt32LE(offset + 4), tag = bytes.toString('ascii', offset, offset + 4);
    if (tag === 'fmt ') rate = bytes.readUInt32LE(offset + 16);
    if (tag === 'data') size = length;
    offset += 8 + length + length % 2;
  }
  assert(rate && size); return size / rate;
}
const results = [];
for (const id of ['natural-search', 'field-search']) {
  const dir = resolve(output, id);
  await mkdir(dir, { recursive: true });
  const record = { id, status: 'FAIL', expectedQuery: 'czerwone koty' };
  let browser, client, page, sw;
  try {
    const wav = resolve(REPO_ROOT, 'test-artifacts/google-live/audio', id + '.wav');
    record.audio = wav;
    browser = await launchChromium({ userDataDir: resolve(dir, 'profile'), extensionDir: resolve(EXT_DIR, 'dist-e2e'), extraArgs: ['--window-size=1440,1000', '--mute-audio', `--use-file-for-fake-audio-capture=${wav}%noloop`] });
    client = await connect(browser.port);
    page = await openPage(client, 'https://www.google.com/');
    await client.send('Page.bringToFront', {}, page.sessionId);
    await waitFor(() => page.evaluate("!!document.getElementById('voice-agent-live-region')"), { label: 'Google content script' });
    record.before = await page.evaluate("({url:location.href,title:document.title,searchField:!!document.querySelector('textarea[name=q],input[name=q]')})");
    assert(record.before.searchField, 'Google homepage search field missing');
    const worker = await waitForTarget(browser.port, t => t.type === 'service_worker' && t.url === `chrome-extension://${extensionId}/background/sw.js`);
    const session = await attach(client, worker.id);
    sw = expression => evaluate(client, session, expression);
    await sw(`(() => {
      globalThis.__googleEvidence={events:[],api:[],updates:[],announcements:[]};
      chrome.runtime.onMessage.addListener(m=>{if(m.target==='sw') __googleEvidence.events.push(m)});
      const update=chrome.tabs.update.bind(chrome.tabs);
      chrome.tabs.update=async(id,options)=>{__googleEvidence.updates.push(options);return update(id,options)};
      const fetchReal=fetch.bind(globalThis);
      globalThis.fetch=async(url,options)=>{const response=await fetchReal(url,options);__googleEvidence.api.push({path:new URL(url).pathname,status:response.status,request:JSON.parse(options.body),body:await response.clone().json().catch(()=>null)});return response};
      const send=chrome.tabs.sendMessage.bind(chrome.tabs);
      chrome.tabs.sendMessage=(id,m,...rest)=>{if(m.type==='ANNOUNCE')__googleEvidence.announcements.push(m.text);return send(id,m,...rest)};
    })()`);
    await sw('__voiceAgentTest.toggle()');
    await waitFor(() => sw("__googleEvidence.events.some(e=>e.type==='MIC_OPEN')"), { label: 'microphone opened' });
    const recordingMs = Math.ceil(duration(await readFile(wav)) * 1000) + 300;
    await new Promise(resolve => setTimeout(resolve, recordingMs));
    await sw('__voiceAgentTest.toggle()');
    await waitFor(async () => (await sw('__voiceAgentTest.state()')).phase === 'idle', { timeoutMs: 40000, label: 'search completed' });
    record.evidence = await sw('__googleEvidence');
    record.transcript = record.evidence.events.find(e => e.type === 'TRANSCRIPT')?.text;
    assert(record.transcript, 'Live Whisper transcript missing');
    assert(!record.evidence.announcements.some(s => s.includes('Nie mogę bezpiecznie odczytać')));
    assert.equal(record.evidence.updates.length, 1, 'Search navigation was not executed exactly once');
    const requested = new URL(record.evidence.updates[0].url);
    assert.equal(requested.hostname, 'www.google.com');
    assert.equal(requested.pathname, '/search');
    assert.equal(requested.searchParams.get('q'), record.expectedQuery);
    await waitFor(() => sw("__googleEvidence.api.some(a=>a.path==='/api/browser-action'&&a.request.stage==='started'&&a.status===200)"), { label: 'browser action logged by backend' });
    await waitFor(() => page.evaluate("document.readyState==='complete'"), { label: 'destination loaded' });
    record.after = await page.evaluate("({url:location.href,title:document.title,captcha:location.pathname.startsWith('/sorry/'),searchField:document.querySelector('textarea[name=q],input[name=q]')?.value??null})");
    record.status = 'PASS_NAVIGATION';
    record.evidence = await sw('__googleEvidence');
  } catch (error) { record.error = error.message; }
  finally {
    if (sw) record.evidence ??= await sw('__googleEvidence').catch(() => null);
    if (page) {
      record.after ??= await page.evaluate("({url:location.href,title:document.title})").catch(() => null);
      const shot = await client.send('Page.captureScreenshot', {}, page.sessionId).catch(() => null);
      if (shot) await writeFile(resolve(dir, 'after.png'), Buffer.from(shot.data, 'base64'));
    }
    if (client) { await client.send('Browser.close').catch(() => {}); client.close(); }
    await browser?.close();
    await writeFile(resolve(dir, 'result.json'), JSON.stringify(record, null, 2));
    results.push(record);
    console.log(`${record.status} ${id}: ${record.error ?? record.transcript}`);
  }
}
await writeFile(resolve(output, 'results.json'), JSON.stringify(results, null, 2));
console.log('Results: ' + output);
if (results.some(r => r.status === 'FAIL')) process.exitCode = 1;
