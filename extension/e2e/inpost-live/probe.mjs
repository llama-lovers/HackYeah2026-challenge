import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launchChromium, connect, openPage, listTargets, EXT_DIR } from '../cdp.mjs';
const out = resolve(EXT_DIR, '../test-artifacts/inpost/probe-' + Date.now());
await mkdir(out, { recursive: true });
let browser, client;
try {
  browser = await launchChromium({ userDataDir: resolve(out, 'profile'), extensionDir: resolve(EXT_DIR, 'dist-e2e'), extraArgs:['--window-size=1440,1000'] });
  client = await connect(browser.port);
  console.log(JSON.stringify((await listTargets(browser.port)).map(t=>({type:t.type,url:t.url}))));
  const page = await openPage(client, 'https://inpost.pl/');
  await new Promise(r => setTimeout(r, 4000));
  const state = await page.evaluate(`({url:location.href,title:document.title, extension:!!document.getElementById('voice-agent-live-region'),
    controls:[...document.querySelectorAll('a,button,input')].filter(e=>e.checkVisibility() && e.getBoundingClientRect().width>0).map(e=>({tag:e.tagName,id:e.id,name:e.getAttribute('aria-label')||e.textContent.trim()||e.placeholder,href:e.href||'',type:e.type||''})),
    text:document.body.innerText.slice(0,5000)})`);
  await writeFile(resolve(out, 'state.json'), JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state));
  const screenshot = await client.send('Page.captureScreenshot', {}, page.sessionId);
  await writeFile(resolve(out, 'page.png'), Buffer.from(screenshot.data, 'base64'));
  console.log('Saved: '+out);
} finally {
  if (client) { await client.send('Browser.close').catch(()=>{}); client.close(); }
  await browser?.close();
}
