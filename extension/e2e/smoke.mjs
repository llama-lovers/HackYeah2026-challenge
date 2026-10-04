import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { matchesSince } from './live-log.mjs';
import { launchChromium, connect, waitForTarget, attach, evaluate, openPage, waitFor, startProcess, stopServiceWorker, wakeServiceWorker, EXT_DIR, SERVER_DIR } from './cdp.mjs';
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
let fake, proxy, browser, client, profileDir;
const extensionDir = join(EXT_DIR, 'dist-e2e');
let passed = 0;
const initScript = `window.__liveLog = [];
new MutationObserver(records => {
  for (const record of records) {
    const node = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
    if (node?.parentElement?.id === 'voice-agent-live-region' && node.textContent.trim()) window.__liveLog.push(node.textContent);
  }
}).observe(document, {subtree:true, childList:true, characterData:true});`;
try {
  // An existing virtualenv can run the suite without installing uv.
  const python = process.env.PYTHON_BIN;
  const service = args => python ? [python, ['-m', ...args]] : ['uv', ['run', '--directory', SERVER_DIR, 'python', '-m', ...args]];
  fake = await startProcess(...service(['tests.fake_openrouter', '--port', '8799', '--record', record]), { cwd: SERVER_DIR, readyUrl: 'http://127.0.0.1:8799/health' });
  proxy = await startProcess(...service(['uvicorn', 'app.main:create_app', '--factory', '--port', '8788', '--no-access-log']), {
    cwd: SERVER_DIR,
    env: { OPENROUTER_API_KEY: 'e2e-dummy-key', OPENROUTER_BASE_URL: 'http://127.0.0.1:8799/api/v1', STT_MODE: 'stub', STT_STUB_TEXT: 'kliknij Znajdź', EXTENSION_ID: extensionId, WARMUP_ON_START: '0' }, readyUrl: proxyOrigin + '/health',
  });
  let lastBuild;
  for (const scenario of scenarios) {
    const started = Date.now();
    try {
      const signature = JSON.stringify(scenario.buildEnv ?? {});
      if (signature !== lastBuild || scenario.freshBrowser) {
        client?.close(); await browser?.close();
        const build = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: EXT_DIR, env: { ...process.env, E2E: '1', OUT_DIR: 'dist-e2e', PROXY_URL: proxyOrigin, ...scenario.buildEnv }, encoding: 'utf8' });
        if (build.status !== 0) throw new Error(build.stderr || build.stdout);
        profileDir = join(temporary, 'profile-' + scenarios.indexOf(scenario));
        browser = await launchChromium({ userDataDir: profileDir, extensionDir });
        client = await connect(browser.port);
        lastBuild = signature;
      }
      const sw = await waitForTarget(browser.port, t => t.type === 'service_worker' && t.url === `chrome-extension://${extensionId}/background/sw.js`);
      let session = await attach(client, sw.id);
      const swEval = expression => evaluate(client, session, expression);
      const liveLog = page => page.evaluate('window.__liveLog');
      const toggle = opts => swEval(`globalThis.__voiceAgentTest.toggle(${JSON.stringify(opts) ?? 'undefined'})`);
      const turnState = () => swEval('globalThis.__voiceAgentTest.state()');
      const waitIdle = timeoutMs => waitFor(async () => (await turnState()).phase === 'idle', { timeoutMs: timeoutMs ?? 10000, label: 'idle turn' });
      // Each speak() marks the end of the page's live log; waits for a message then only look at entries added since that mark.
      const marks = new WeakMap();
      const waitForLive = (page, expected, timeoutMs) => waitFor(async () => {
        const log = await liveLog(page);
        return typeof expected === 'function' ? expected(log) : matchesSince(log, marks.get(page), expected);
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
          marks.set(page, (await liveLog(page)).length);
          await toggle({ stubText }); await waitForLive(page, 'Słucham.');
          await new Promise(resolve => setTimeout(resolve, 800));
          await toggle(); await waitForLive(page, 'Przetwarzam.');
        },
        upstreamMark: async () => (await upstream()).length,
        upstreamSince: async mark => (await upstream()).slice(mark),
        proxyOutput: () => proxy.output(),
        // Kills the service worker (all in-memory state is lost, session storage stays) and wakes it with an extension message.
        async restartWorker() {
          await stopServiceWorker(client, browser.port, extensionId);
          const woken = await wakeServiceWorker(client, browser.port, extensionId);
          session = await attach(client, woken.id);
        },
        // Closes the browser and starts a new one on the SAME profile directory: durable extension storage survives, session storage does not.
        async restartBrowser() {
          client.close(); await browser.close();
          await rm(join(profileDir, 'DevToolsActivePort'), { force: true });
          browser = await launchChromium({ userDataDir: profileDir, extensionDir });
          client = await connect(browser.port);
          ctx.client = client; ctx.browser = browser;
          // A service worker is only started by an event; a fixture page's content script (READY) wakes it.
          const warm = await openPage(client, proxyOrigin + '/fixtures/tracking-form.html', { initScript });
          const restarted = await waitForTarget(browser.port, t => t.type === 'service_worker' && t.url === `chrome-extension://${extensionId}/background/sw.js`);
          session = await attach(client, restarted.id);
          await client.send('Target.closeTarget', { targetId: warm.targetId });
        },
      };
      // A timed-out scenario keeps running in the background, so its browser is discarded (never reused) and its late calls fail on the closed connection.
      let timer, timedOut = false;
      const running = Promise.resolve().then(() => scenario.run(ctx));
      running.catch(() => {});
      try { await Promise.race([running, new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; reject(new Error('Scenario timeout')); }, scenario.timeoutMs ?? 30000); })]); }
      catch (error) {
        if (timedOut) {
          client?.close(); await browser?.close(); client = undefined; browser = undefined; lastBuild = undefined;
          await Promise.race([running.catch(() => {}), new Promise(resolve => setTimeout(resolve, 2000))]);
        }
        throw error;
      }
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
