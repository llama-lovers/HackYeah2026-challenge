import assert from 'node:assert/strict';
import { waitForTarget, attach, evaluate, waitFor } from '../cdp.mjs';
import { OPTIONS_MIC_GRANTED, OPTIONS_SHORTCUT_MISSING, MIC_DENIED } from '../../src/shared/messages.pl.ts';
export const name = 'onboarding';
export const freshBrowser = true;
export async function run(ctx) {
  const target = await waitForTarget(ctx.browser.port, t => t.type === 'page' && t.url.endsWith('/options/options.html'));
  const session = await attach(ctx.client, target.id);
  const pageEval = expr => evaluate(ctx.client, session, expr);
  await ctx.client.send('Page.bringToFront', {}, session);
  await waitFor(() => pageEval("document.readyState === 'complete' && document.activeElement.id === 'grant-mic'"), { label: 'options autofocus' });
  assert.deepEqual(await pageEval("({lang:document.documentElement.lang,button:document.querySelector('#grant-mic').textContent,status:document.querySelector('#mic-status').getAttribute('role')})"), { lang: 'pl', button: 'Włącz mikrofon', status: 'status' });
  // Use the keyboard path from the initially focused button.
  await ctx.client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, session);
  await ctx.client.send('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 }, session);
  await ctx.client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, session);
  await waitFor(() => pageEval(`document.querySelector('#mic-status').textContent === ${JSON.stringify(OPTIONS_MIC_GRANTED)}`), { timeoutMs: 5000, label: 'microphone grant status' }).catch(async error => { throw new Error(error.message + ': ' + await pageEval("JSON.stringify({status:document.querySelector('#mic-status').textContent,focus:document.activeElement.id})")); });
  const shortcut = await pageEval("document.querySelector('#shortcut-info').textContent");
  assert(shortcut.includes('Alt+Shift+A') || shortcut === OPTIONS_SHORTCUT_MISSING);
  await ctx.swEval('globalThis.__ttsLog = []; chrome.tts.speak = text => globalThis.__ttsLog.push(text)');
  await ctx.swEval("chrome.storage.session.set({turn:{phase:'recording',startedAt:Date.now(),id:'onboarding-turn'}})");
  await pageEval("chrome.runtime.sendMessage({target:'sw',turnId:'onboarding-turn',type:'MIC_ERROR',code:'not_allowed'})");
  await waitFor(() => ctx.swEval(`globalThis.__ttsLog.includes(${JSON.stringify(MIC_DENIED)})`), { label: 'denied microphone fallback' });
  await ctx.waitIdle();
}
