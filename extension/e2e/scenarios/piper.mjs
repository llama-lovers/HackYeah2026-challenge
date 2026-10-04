import assert from 'node:assert/strict';
import { waitForTarget, attach, evaluate, waitFor } from '../cdp.mjs';
import { encodeWav16 } from '../../src/shared/wav.ts';

export const name = 'piper';
export const timeoutMs = 90000;
export const freshBrowser = true;

export async function run(ctx) {
  const optionsTarget = await waitForTarget(ctx.browser.port, t => t.url.endsWith('/options/options.html'));
  const optionsSession = await attach(ctx.client, optionsTarget.id);
  const options = expr => evaluate(ctx.client, optionsSession, expr);
  await waitFor(() => options("document.readyState === 'complete'"));
  assert.equal(await options("document.querySelector('#speech-output')?.value"), 'screen_reader');
  await options("document.querySelector('#speech-output').value='piper'; document.querySelector('#save-speech').click()");
  await waitFor(() => options("document.querySelector('#speech-status').textContent === 'Ustawienia głosu zapisane.'"));
  assert.equal(await ctx.swEval("chrome.storage.local.get('speechOutput').then(items=>items.speechOutput)"), 'piper');

  await ctx.swEval(`(async () => {
    if (!(await chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})).length)
      await chrome.offscreen.createDocument({url:'offscreen/offscreen.html',reasons:['USER_MEDIA','AUDIO_PLAYBACK'],justification:'Test speech playback'});
  })()`);
  const target = await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'));
  const session = await attach(ctx.client, target.id);
  const offscreen = expr => evaluate(ctx.client, session, expr);
  const wav = [...new Uint8Array(encodeWav16(new Float32Array(1600), 16000))];
  await offscreen(`(() => {
    const fetchAudio=globalThis.fetch; globalThis.__speechRequests=[]; globalThis.__audioEvents=[];
    globalThis.__failSpeech=false; globalThis.__longSpeech=false;
    globalThis.fetch=(url,init)=> {
      if (!String(url).endsWith('/api/speak')) return fetchAudio(url,init);
      globalThis.__speechRequests.push(JSON.parse(init.body).text);
      return Promise.resolve(globalThis.__failSpeech ? new Response('{}',{status:502}) : new Response(new Uint8Array(${JSON.stringify(wav)}),{headers:{'content-type':'audio/wav'}}));
    };
    const original=AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource=function(...args) {
      const source=original.apply(this,args); const start=source.start.bind(source),stop=source.stop.bind(source);
      source.start=(...params)=>{if(globalThis.__longSpeech)source.loop=true;globalThis.__audioEvents.push('play');start(...params);};
      source.stop=(...params)=>{globalThis.__audioEvents.push('stop');stop(...params);};
      return source;
    };
    const capture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=(...args)=>{globalThis.__audioEvents.push('mic');return capture(...args);};
  })()`);
  await ctx.swEval("globalThis.__ttsLog=[];chrome.tts.speak=(text,options)=>{globalThis.__ttsLog.push(text);options?.onEvent?.({type:'end'})}");

  // The options test uses the real offscreen decoder and AudioContext playback.
  await options("document.querySelector('#test-speech').click()");
  await waitFor(() => options("document.querySelector('#speech-status').textContent === 'Test głosu zakończony.'"));
  assert.deepEqual(await offscreen('globalThis.__audioEvents'), ['play']);
  assert.deepEqual(await ctx.swEval('globalThis.__ttsLog'), []);

  // Both pre-action and outcome announcements reach Piper, without ARIA duplication.
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await ctx.toggle({stubText:'kliknij Znajdź'});
  await waitFor(async () => (await ctx.turnState()).phase === 'recording');
  await new Promise(resolve => setTimeout(resolve,800));
  await ctx.toggle(); await ctx.waitIdle(20000);
  const requests = await offscreen('globalThis.__speechRequests');
  assert(requests.includes('Słucham.'));
  assert(requests.includes('Klikam Znajdź.'), JSON.stringify(requests));
  assert(requests.some(text=>text.includes('Wpisz poprawny numer przesyłki')), JSON.stringify(requests));
  assert((await page.evaluate("document.querySelector('#typingErrorMsgContainer').textContent")).includes('Wpisz poprawny numer przesyłki'));
  assert.deepEqual(await ctx.liveLog(page), []);

  // Replay uses Piper too.
  const count=requests.length;
  await ctx.toggle({stubText:'powtórz'});
  await waitFor(async () => (await ctx.turnState()).phase === 'recording');
  await new Promise(resolve => setTimeout(resolve,800));
  await ctx.toggle(); await ctx.waitIdle(20000);
  assert.equal((await offscreen('globalThis.__speechRequests')).at(-1),requests.at(-1));
  assert((await offscreen('globalThis.__speechRequests')).length>count);

  // A real keyboard-path handler interrupts playback before opening the mic.
  await offscreen('globalThis.__longSpeech=true;globalThis.__audioEvents=[]');
  const longSpeech = options("chrome.runtime.sendMessage({target:'sw',type:'SPEAK',text:'Długa odpowiedź.'})");
  await waitFor(() => offscreen("globalThis.__audioEvents.includes('play')"));
  // Make the next (listening) utterance finite.
  await offscreen('globalThis.__longSpeech=false');
  await ctx.toggle({stubText:'co tu jest?'});
  await waitFor(async () => (await ctx.turnState()).phase === 'recording');
  assert.deepEqual(await longSpeech,{ok:false,cancelled:true});
  const events=await offscreen('globalThis.__audioEvents');
  assert(events.indexOf('stop')<events.indexOf('mic'),JSON.stringify(events));
  // Speech requests during recording are cancelled rather than captured by STT.
  assert.deepEqual(await options("chrome.runtime.sendMessage({target:'sw',type:'SPEAK',text:'Nie mów do mikrofonu.'})"),{ok:false,cancelled:true});
  await new Promise(resolve => setTimeout(resolve,800));
  await ctx.toggle();await ctx.waitIdle(20000);

  await offscreen('globalThis.__failSpeech=true');
  await options("document.querySelector('#test-speech').click()");
  await waitFor(() => ctx.swEval('globalThis.__ttsLog.length > 0'));
  assert.equal((await ctx.swEval('globalThis.__ttsLog')).at(-1), 'Dzień dobry. Tu FastEcho. Lokalny głos Piper jest gotowy.');
  await options("document.querySelector('#speech-output').value='screen_reader';document.querySelector('#save-speech').click()");
  await waitFor(() => ctx.swEval("chrome.storage.local.get('speechOutput').then(items=>items.speechOutput === 'screen_reader')"));
}
