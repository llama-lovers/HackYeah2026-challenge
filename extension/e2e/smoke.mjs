import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { launchChromium, connect, waitForTarget, attach, evaluate, openPage, waitFor, startProcess, EXT_DIR, SERVER_DIR } from './cdp.mjs';
const requested = process.argv.slice(2);
const scenarios = [];
for (const file of (await readdir(join(EXT_DIR, 'e2e/scenarios'))).filter(f => f.endsWith('.mjs')).sort()) {
  const scenario = await import(pathToFileURL(join(EXT_DIR, 'e2e/scenarios', file)));
  if (!requested.length || requested.includes(scenario.name)) scenarios.push(scenario);
}
if (!scenarios.length || requested.some(n => !scenarios.some(s => s.name === n))) throw new Error('Unknown or empty scenario selection');
const temporary = await mkdtemp(join(tmpdir(), 'voice-e2e-'));
const record = join(temporary, 'upstream.jsonl');
const proxyOrigin = 'http://localhost:8788';
const extensionId = spawnSync(process.execPath, ['scripts/gen-key.mjs', '--id', 'static/manifest.json'], { cwd: EXT_DIR, encoding: 'utf8' }).stdout.trim();
let fake, proxy, browser, client;
let passed = 0;
const initScript = `window.__liveLog = [];
new MutationObserver(records => {
  for (const record of records) {
    const node = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
    if (node?.parentElement?.id === 'voice-agent-live-region' && node.textContent.trim()) window.__liveLog.push(node.textContent);
  }
}).observe(document, {subtree:true, childList:true, characterData:true});`;
try {
  fake = await startProcess('uv', ['run', '--directory', SERVER_DIR, 'python', '-m', 'tests.fake_openrouter', '--port', '8799', '--record', record], { readyUrl: 'http://127.0.0.1:8799/health' });
  proxy = await startProcess('uv', ['run', '--directory', SERVER_DIR, 'uvicorn', 'app.main:create_app', '--factory', '--port', '8788', '--no-access-log'], {
    env: { OPENROUTER_API_KEY: 'e2e-dummy-key', OPENROUTER_BASE_URL: 'http://127.0.0.1:8799/api/v1', STT_MODE: 'stub', STT_STUB_TEXT: 'kliknij Znajdź', EXTENSION_ID: extensionId, WARMUP_ON_START: '0' }, readyUrl: proxyOrigin + '/health',
  });
  let lastBuild;
  for (const scenario of scenarios) {
    const started = Date.now();
    try {
      const signature = JSON.stringify(scenario.buildEnv ?? {});
      if (signature !== lastBuild) {
        client?.close(); await browser?.close();
        const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: EXT_DIR, env: { ...process.env, E2E: '1', OUT_DIR: 'dist-e2e', PROXY_URL: proxyOrigin, ...scenario.buildEnv }, encoding: 'utf8' });
        if (build.status !== 0) throw new Error(build.stderr || build.stdout);
        browser = await launchChromium({ userDataDir: join(temporary, 'profile-' + scenarios.indexOf(scenario)), extensionDir: join(EXT_DIR, 'dist-e2e') });
        client = await connect(browser.port);
        lastBuild = signature;
      }
      const sw = await waitForTarget(browser.port, t => t.type === 'service_worker' && t.url === `chrome-extension://${extensionId}/background/sw.js`);
      const session = await attach(client, sw.id);
      const swEval = expression => evaluate(client, session, expression);
      const liveLog = page => page.evaluate('window.__liveLog');
      const toggle = opts => swEval(`globalThis.__voiceAgentTest.toggle(${JSON.stringify(opts) ?? 'undefined'})`);
      const turnState = () => swEval('globalThis.__voiceAgentTest.state()');
      const waitIdle = timeoutMs => waitFor(async () => (await turnState()).phase === 'idle', { timeoutMs: timeoutMs ?? 10000, label: 'idle turn' });
      const waitForLive = (page, expected, timeoutMs) => waitFor(async () => {
        const log = await liveLog(page);
        return typeof expected === 'function' ? expected(log) : log.includes(expected);
      }, { timeoutMs: timeoutMs ?? 10000, label: 'live announcement' });
      const upstream = async () => (await readFile(record, 'utf8').catch(() => '')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
      const ctx = {
        proxyOrigin, extensionId, client, browser, swEval, toggle, turnState, waitIdle, liveLog, waitForLive,
        openPage: async path => {
          const page = await openPage(client, path.startsWith('/') ? proxyOrigin + path : path, { initScript });
          await client.send('Page.bringToFront', {}, page.sessionId);
          if (path.startsWith('/fixtures')) await waitFor(() => page.evaluate("!!document.getElementById('voice-agent-live-region')"), { label: 'content initialization' });
          return page;
        },
        async speak(page, stubText) {
          await toggle({ stubText }); await waitForLive(page, 'Słucham.');
          await new Promise(resolve => setTimeout(resolve, 800));
          await toggle(); await waitForLive(page, 'Przetwarzam.');
        },
        upstreamMark: async () => (await upstream()).length,
        upstreamSince: async mark => (await upstream()).slice(mark),
        proxyOutput: () => proxy.output(),
      };
      let timer;
      try { await Promise.race([scenario.run(ctx), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Scenario timeout')), scenario.timeoutMs ?? 30000); })]); }
      finally { clearTimeout(timer); }
      passed++;
      console.log(`PASS ${scenario.name} (${Date.now() - started} ms)`);
    } catch (error) { console.error(`FAIL ${scenario.name}: ${error.message}`); }
  }
} finally {
  client?.close(); await browser?.close(); await proxy?.stop(); await fake?.stop();
  await rm(temporary, { recursive: true, force: true });
}
console.log(`e2e: ${passed}/${scenarios.length} passed`);
if (passed !== scenarios.length) process.exitCode = 1;
