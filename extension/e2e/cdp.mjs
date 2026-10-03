import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const REPO_ROOT = resolve(EXT_DIR, '..');
export const SERVER_DIR = join(REPO_ROOT, 'server');
const children = new Set();
const sockets = new Set();
const cleanup = () => { for (const socket of sockets) socket.close(); for (const child of children) child.kill('SIGTERM'); };
process.once('exit', cleanup);
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { cleanup(); process.exit(signal === 'SIGINT' ? 130 : 143); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function waitFor(fn, { timeoutMs = 10000, intervalMs = 100, label = 'condition' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() <= deadline) {
    try { const value = await fn(); if (value) return value; } catch (e) { lastError = e; }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for ${label}${lastError ? `: ${lastError.message}` : ''}`);
}
function track(child) {
  children.add(child);
  let output = '';
  child.stdout?.on('data', d => { output += d; });
  child.stderr?.on('data', d => { output += d; });
  let spawnError;
  child.on('error', e => { spawnError = e; });
  child.once('exit', () => children.delete(child));
  return { output: () => output, check() { if (spawnError) throw spawnError; if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Process exited: ${output}`); } };
}
async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise(done => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, 2000);
    child.once('exit', () => { clearTimeout(timer); done(); });
    child.kill('SIGTERM');
  });
}
export async function launchChromium({ userDataDir, extensionDir = null, headless = process.env.HEADFUL !== '1', extraArgs = [] }) {
  const args = ['--remote-debugging-port=0', `--user-data-dir=${userDataDir}`, '--no-first-run', '--no-default-browser-check', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'];
  if (headless) args.push('--headless=new');
  if (extensionDir) args.push(`--load-extension=${extensionDir}`, `--disable-extensions-except=${extensionDir}`, '--disable-features=DisableLoadExtensionCommandLineSwitch');
  const proc = spawn(process.env.CHROMIUM_BIN || 'chromium', [...args, ...extraArgs, 'about:blank'], { stdio: ['ignore', 'pipe', 'pipe'] });
  const tracked = track(proc);
  try {
    const port = await waitFor(async () => {
      tracked.check();
      const data = await readFile(join(userDataDir, 'DevToolsActivePort'), 'utf8');
      return Number(data.split('\n')[0]) || false;
    }, { timeoutMs: 20000, label: 'Chromium DevToolsActivePort' });
    return { port, proc, close: () => stopChild(proc) };
  } catch (e) { await stopChild(proc); throw new Error(`${e.message}\n${tracked.output()}`); }
}
export async function connect(port) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  sockets.add(ws);
  let counter = 0;
  const pending = new Map(), handlers = new Map();
  await new Promise((done, reject) => { ws.addEventListener('open', done, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id !== undefined) {
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id); clearTimeout(p.timer);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    } else for (const handler of handlers.get(m.method) || []) handler(m.params, m.sessionId);
  });
  ws.addEventListener('close', () => {
    sockets.delete(ws);
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(new Error('CDP connection closed')); }
    pending.clear();
  });
  return {
    send(method, params = {}, sessionId) {
      return new Promise((resolve, reject) => {
        const id = ++counter;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 20000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
    },
    on(event, handler) {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event).add(handler);
      return () => handlers.get(event).delete(handler);
    },
    close() { ws.close(); },
  };
}
export async function listTargets(port) { return (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); }
export async function waitForTarget(port, predicate, timeoutMs = 10000) { return waitFor(async () => (await listTargets(port)).find(predicate), { timeoutMs, label: 'target' }); }
export async function attach(client, targetId) { return (await client.send('Target.attachToTarget', { targetId, flatten: true })).sessionId; }
export async function evaluate(client, sessionId, expression) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
export async function openPage(client, url, { initScript } = {}) {
  const { targetId } = await client.send('Target.createTarget', { url: 'about:blank' });
  const sessionId = await attach(client, targetId);
  await client.send('Page.enable', {}, sessionId);
  await client.send('Runtime.enable', {}, sessionId);
  if (initScript) await client.send('Page.addScriptToEvaluateOnNewDocument', { source: initScript }, sessionId);
  const page = { targetId, sessionId, evaluate: expr => evaluate(client, sessionId, expr), async goto(nextUrl) {
    const result = await client.send('Page.navigate', { url: nextUrl }, sessionId);
    if (result.errorText) throw new Error(result.errorText);
    await waitFor(() => page.evaluate(`location.href === ${JSON.stringify(nextUrl)} && document.readyState === 'complete'`), { label: `loaded ${nextUrl}` });
  } };
  await page.goto(url);
  return page;
}
export async function startProcess(cmd, args, { cwd, env, readyUrl, timeoutMs = 20000 } = {}) {
  const proc = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const tracked = track(proc);
  try {
    if (readyUrl) await waitFor(async () => { tracked.check(); const response = await fetch(readyUrl, { signal: AbortSignal.timeout(1000) }); return response.status > 0; }, { timeoutMs, label: readyUrl });
    return { proc, output: tracked.output, stop: () => stopChild(proc) };
  } catch (e) { await stopChild(proc); throw new Error(`${e.message}\n${tracked.output()}`); }
}
export async function serveStatic(rootDir, { prefix = '/fixtures' } = {}) {
  const root = resolve(rootDir);
  const server = createServer(async (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (!path.startsWith(prefix + '/')) { res.writeHead(404).end(); return; }
      const file = resolve(root, path.slice(prefix.length + 1));
      if (!file.startsWith(root + sep) || !(await stat(file)).isFile()) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'content-type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
      res.end(await readFile(file));
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  return { origin: `http://127.0.0.1:${server.address().port}`, close: () => new Promise(done => { server.close(done); server.closeAllConnections(); }) };
}
export async function bundleForPage(contents, resolveDir = EXT_DIR) {
  const { build } = await import('esbuild');
  const result = await build({ stdin: { contents, resolveDir, loader: 'ts' }, bundle: true, format: 'iife', target: 'es2022', write: false });
  return result.outputFiles[0].text;
}
