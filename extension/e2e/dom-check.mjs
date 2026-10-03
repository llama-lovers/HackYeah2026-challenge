import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveStatic, launchChromium, connect, openPage, bundleForPage, waitFor, EXT_DIR, SERVER_DIR } from './cdp.mjs';

const profile = await mkdtemp(join(tmpdir(), 'voice-dom-check-'));
let server, browser, client, lastText = '';
try {
  server = await serveStatic(join(SERVER_DIR, 'fixtures'));
  browser = await launchChromium({ userDataDir: profile });
  client = await connect(browser.port);
  const bundle = await bundleForPage(`import {takeSnapshot, resolveTarget} from './src/content/snapshot.ts'; import {toModelText} from './src/shared/snapshot-format.ts'; import {validateProposal} from './src/shared/validate.ts'; globalThis.__snapTest={takeSnapshot,resolveTarget,toModelText,validateProposal};`, EXT_DIR);
  const page = await openPage(client, server.origin + '/fixtures/tracking-form.html');
  await page.evaluate(bundle);
  const tracking = await page.evaluate(`(() => { const before=document.documentElement.outerHTML; const snapshot=__snapTest.takeSnapshot(); globalThis.__saved=snapshot; return {snapshot,text:__snapTest.toModelText(snapshot),same:before===document.documentElement.outerHTML}; })()`);
  lastText = tracking.text;
  assert.match(lastText, /textbox e\d+ "Enter parcel numbers separated by commas" placeholder="Wpisz numer przesyłki"/u);
  assert.match(lastText, /button e\d+ "Znajdź"/u);
  assert.match(lastText, /link e\d+ "Szukaj" href=\/fixtures\/szukaj.html/u);
  assert.match(lastText, /button e\d+ "Dalej" disabled/u);
  assert.match(lastText, /button e\d+ "Pomoc"/u);
  assert.equal(lastText.split('\n').filter(s => s.includes('"Szukaj"')).length, 1);
  console.log('PASS dom-check: tracking-form text');

  assert.equal(tracking.same, true);
  assert.deepEqual(await page.evaluate(`(() => { const s=__saved, id=s.nodes.find(n=>n.name==='Znajdź').id; return {unknown:__snapTest.resolveTarget('e999',s.epoch).target,stale:__snapTest.resolveTarget(id,s.epoch-1).target.epochMatches,lookup:__snapTest.resolveTarget(id,s.epoch).target.submitsNonLookupForm,space:__snapTest.resolveTarget(' '+id,s.epoch).target,case:__snapTest.resolveTarget(id.toUpperCase(),s.epoch).target}; })()`), { unknown: null, stale: false, lookup: false, space: null, case: null });
  console.log('PASS dom-check: invariants');

  const start = Date.now();
  await page.evaluate(`(() => { const el=document.querySelector('#ShipmentNumber'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'873234987612340872938732'); el.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('.tracking-form button').click(); })()`);
  await waitFor(() => page.evaluate(`!!document.querySelector('div.loader')`), { timeoutMs: 300, intervalMs: 20, label: 'loader within 300 ms' });
  await waitFor(() => page.evaluate(`document.body.textContent.includes('Status: W drodze do paczkomatu')`), { timeoutMs: 3000, label: 'tracking result' });
  assert.ok(Date.now() - start < 3000);
  assert.equal(await page.evaluate('location.search'), '?number=873234987612340872938732');
  assert.equal(await page.evaluate(`document.querySelector('.btnSearchMobile').checkVisibility()`), false);
  console.log('PASS dom-check: tracking-form behavior');

  await page.goto(server.origin + '/fixtures/sensitive.html'); await page.evaluate(bundle);
  const sensitive = await page.evaluate(`(() => { const snapshot=__snapTest.takeSnapshot(); return {snapshot,text:__snapTest.toModelText(snapshot),submit:__snapTest.resolveTarget(snapshot.nodes.find(n=>n.name==='Zapłać').id,snapshot.epoch).target}; })()`);
  lastText = sensitive.text;
  for (const secret of ['Tajne!Haslo1', 'PL61 1090 1014 0000 0712 1981 2874', '4111 1111 1111 1111', 'value="846"']) assert.ok(!lastText.includes(secret), `secret exposed: ${secret}`);
  // The required parcel positive control starts with the invalid PESEL test value.
  for (const secret of ['44051401359', '12345678901', '4111111111111111', '731904']) assert.ok(!new RegExp(`(?<!\\d)${secret}(?!\\d)`).test(lastText), `secret token exposed: ${secret}`);
  assert.ok((lastText.match(/\[ukryte\]/g) || []).length >= 10);
  assert.ok(lastText.includes('873234987612340872938732'));
  assert.ok(lastText.includes('123456789012345678901234'));
  assert.equal(sensitive.submit.submitsNonLookupForm, true);
  assert.ok(!JSON.stringify(sensitive.snapshot).includes('Tajne!Haslo1'));
  const protectedFields = sensitive.snapshot.nodes.filter(n => n.state?.sensitive);
  assert.equal(protectedFields.length, 7);
  for (const node of protectedFields) assert.equal(node.value, '[ukryte]');
  console.log('PASS dom-check: sensitive');

  await page.goto(server.origin + '/fixtures/szukaj.html'); await page.evaluate(bundle);
  lastText = await page.evaluate(`__snapTest.toModelText(__snapTest.takeSnapshot())`);
  assert.ok(lastText.includes('path: /fixtures/szukaj.html'));
  assert.ok(lastText.includes('heading "Wyniki wyszukiwania"'));
  console.log('PASS dom-check: szukaj');

  // Live policy must remain safe if the page changes after the model snapshot.
  const live = await page.evaluate(`(() => {
    const s=__snapTest.takeSnapshot(), input=document.querySelector('input'), id=s.nodes.find(n=>n.role==='searchbox').id;
    const p={action:'fill',target:id,text:'123',needs_confirmation:false,say:''};
    input.setAttribute('autocomplete','one-time-code');
    const sensitive=__snapTest.validateProposal(p,__snapTest.resolveTarget(id,s.epoch).target);
    input.removeAttribute('autocomplete'); input.hidden=true;
    const hidden=__snapTest.validateProposal(p,__snapTest.resolveTarget(id,s.epoch).target);
    input.hidden=false; input.disabled=true;
    const disabled=__snapTest.validateProposal(p,__snapTest.resolveTarget(id,s.epoch).target);
    input.disabled=false; input.setAttribute('role','button');
    const role=__snapTest.validateProposal(p,__snapTest.resolveTarget(id,s.epoch).target);
    input.remove();
    const removed=__snapTest.validateProposal(p,__snapTest.resolveTarget(id,s.epoch).target);
    return {sensitive,hidden,disabled,role,removed};
  })()`);
  for (const [key, reason] of Object.entries({ sensitive: 'sensitive_fill', hidden: 'hidden', disabled: 'disabled', role: 'role_mismatch', removed: 'not_found' })) assert.deepEqual(live[key], { ok: false, reason });
  console.log('PASS dom-check: live policy changes');

  await page.evaluate(`document.body.innerHTML='<main><p>Keep me</p><h1>Heading<span hidden>heading injection</span></h1><div role="alert">Alert<span hidden>alert injection</span></div><div hidden>hidden injection</div><div inert>inert injection</div><div aria-hidden="true">aria injection</div><div style="opacity:0">opacity injection</div><label>label injection</label><div id="voice-agent-live-region">own region injection</div></main>';`);
  lastText = await page.evaluate(`__snapTest.toModelText(__snapTest.takeSnapshot())`);
  assert.ok(lastText.includes('Keep me'));
  assert.ok(!lastText.includes('injection'));
  const cap = await page.evaluate(`(() => { document.body.innerHTML='<div></div><main><button>Priority</button></main>'; const d=document.querySelector('div'); for(let i=0;i<300;i++){const p=document.createElement('p');p.textContent='Text '+i;d.append(p);} return __snapTest.takeSnapshot(); })()`);
  assert.equal(cap.nodes.length, 250); assert.equal(cap.truncated, true); assert.ok(cap.nodes.some(n => n.name === 'Priority'));
  await page.evaluate(`document.body.replaceChildren()`);
  const empty = await page.evaluate(`__snapTest.takeSnapshot()`);
  assert.deepEqual(empty.nodes, []); assert.equal(empty.truncated, false);
  console.log('PASS dom-check: hidden text, cap and empty page');

  const renamed = await page.evaluate(`(() => { document.body.innerHTML='<button>Lookup</button>';const s=__snapTest.takeSnapshot(),id=s.nodes[0].id;document.querySelector('button').textContent='Zapłać';return __snapTest.validateProposal({action:'click',target:id,text:'',needs_confirmation:false,say:''},__snapTest.resolveTarget(id,s.epoch).target); })()`);
  assert.deepEqual(renamed, { ok: false, reason: 'irreversible' });
  console.log('PASS dom-check: live irreversible name');

  await page.evaluate(`document.body.innerHTML='<main><div role="status"><textarea autocomplete="current-password">Tajne!Haslo1</textarea><button aria-label="Tajne!Haslo1">Szukaj</button></div><h2>Hasło Tajne!Haslo1 <textarea autocomplete="one-time-code">731904</textarea></h2><input type="password" value="Tajne!Haslo1" aria-label="Hasło Tajne!Haslo1"><input autocomplete="cc-csc" value="846"><p>Kod 846 i 731904</p><div id="secret-label"><textarea autocomplete="new-password">EchoSecret</textarea>Etykieta</div><button aria-labelledby="secret-label">Szukaj</button><input placeholder="Numer przesyłki" value="123456789012345678901234"></main>'`);
  const privateSnapshot = await page.evaluate(`__snapTest.takeSnapshot()`);
  for (const secret of ['Tajne!Haslo1', '731904', '846', 'EchoSecret']) assert.ok(!JSON.stringify(privateSnapshot).includes(secret), 'aggregated secret: ' + secret);
  assert.ok(JSON.stringify(privateSnapshot).includes('123456789012345678901234'));
  console.log('PASS dom-check: secret echoes, aggregates and referenced labels');
  await page.evaluate(`document.body.innerHTML='<main><div style="display:contents"><button>Szukaj przez contents</button></div><div style="width:0;height:0;position:relative"><button style="position:absolute;width:100px;height:30px">Znajdź pozycjonowany</button></div><span id="shadow-host" style="display:contents"></span><div aria-live="polite">Wynik <input placeholder="Numer przesyłki"><button>Znajdź live</button></div><h2>Nagłówek <button>Szukaj nagłówek</button></h2></main>'; document.querySelector('#shadow-host').attachShadow({mode:'open'}).innerHTML='<button>Szukaj shadow</button>'`);
  const structural = await page.evaluate(`__snapTest.takeSnapshot()`);
  for (const name of ['Szukaj przez contents', 'Znajdź pozycjonowany', 'Szukaj shadow', 'Znajdź live', 'Szukaj nagłówek', 'Numer przesyłki']) assert.ok(structural.nodes.some(n => n.kind === 'interactive' && n.name === name), 'missing descendant ' + name);
  console.log('PASS dom-check: structural containers retain visible controls');
} catch (error) {
  console.error(`FAIL dom-check: ${error.stack}\n${lastText}`); process.exitCode = 1;
} finally {
  client?.close(); await browser?.close(); await server?.close(); await rm(profile, { recursive: true, force: true });
}
