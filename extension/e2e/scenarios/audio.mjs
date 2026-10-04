import assert from 'node:assert/strict';
import { waitForTarget, attach, evaluate, waitFor } from '../cdp.mjs';
export const name = 'audio';
export const timeoutMs = 90000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function captureAssertions(ctx, page) {
  const target = await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'));
  const session = await attach(ctx.client, target.id);
  const audioEval = expression => evaluate(ctx.client, session, expression);
  await audioEval(`(() => {
    globalThis.__rms=0;globalThis.__uploads=0;globalThis.__connections=[];
    globalThis.__sampleOriginal=AnalyserNode.prototype.getFloatTimeDomainData;
    AnalyserNode.prototype.getFloatTimeDomainData=function(samples){samples.fill(globalThis.__rms);};
    globalThis.__connectOriginal=AudioNode.prototype.connect;
    AudioNode.prototype.connect=function(node,...args){__connections.push([this.constructor.name,node.constructor.name]);return __connectOriginal.call(this,node,...args);};
    globalThis.__captureOriginal=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await __captureOriginal(constraints);globalThis.__tracks=stream.getTracks();return stream;};
    globalThis.__fetchOriginal=fetch;
    globalThis.fetch=(url,opts)=>{if(String(url).includes('/api/transcribe')){__uploads++;url=new URL('/api/transcribe?text='+encodeURIComponent('kliknij Pokaż mapę'),String(url)).href;}return __fetchOriginal(url,opts);};
    globalThis.__audioEvents=[];
  })()`);
  try {
    await ctx.toggle();
    await waitFor(async () => (await audioEval('__audioEvents')).some(e => e.type === 'mic_open'), { label: 'measured mic open' });
    await delay(1600); assert.equal((await ctx.turnState()).phase, 'recording', 'initial quiet');
    await audioEval('__rms=0.1'); await delay(80); await audioEval('__rms=0');
    await delay(1400); assert.equal((await ctx.turnState()).phase, 'recording', 'short hesitation');
    await audioEval('__rms=0.1'); await delay(400); await audioEval('__rms=0');
    await waitFor(async () => (await audioEval('__audioEvents')).some(e => e.type === 'finalize'), { timeoutMs: 4000, label: 'silence finalize' });
    await ctx.waitIdle();
    const events = await audioEval('__audioEvents');
    assert.equal(events.filter(e => e.type === 'mic_open').length, 1);
    assert.equal(events.filter(e => e.type === 'mic_close').length, 1);
    assert.equal(events.filter(e => e.type === 'finalize').length, 1);
    assert.equal(events.find(e => e.type === 'finalize').detail, 'silence');
    assert.equal(await audioEval('__uploads'), 1);
    assert(await audioEval('__tracks.every(t=>t.readyState==="ended")'));
    assert(!(await audioEval('__connections')).some(([a,b]) => ['AnalyserNode','MediaStreamAudioSourceNode'].includes(a) && b === 'AudioDestinationNode'));
    // Adjacent explicit toggle/silence completion is idempotent; safety stop is discard-only.
    await audioEval('__audioEvents=[];__rms=0.1'); await ctx.toggle();
    await waitFor(async () => (await audioEval('__audioEvents')).some(e => e.type === 'mic_open'), { label: 'second mic open' });
    await delay(350); await audioEval('__rms=0'); await delay(1050);
    await ctx.swEval('globalThis.__voiceAgentTest.stop()'); await delay(500);
    assert.equal(await audioEval('__uploads'), 1, 'discard uploads nothing');
    assert(await audioEval('__tracks.every(t=>t.readyState==="ended")'));
    const discarded = await audioEval('__audioEvents');
    assert.equal(discarded.filter(e => e.type === 'mic_close').length, 1);
    assert.equal(discarded.filter(e => e.type === 'finalize').length, 0);
    await audioEval('__audioEvents=[];__rms=0.1'); await ctx.toggle();
    await waitFor(async () => (await audioEval('__audioEvents')).some(e => e.type === 'mic_open'), { label: 'race mic open' });
    await delay(400); await audioEval('__rms=0'); await delay(1050);
    const owner = (await ctx.turnState()).id;
    await ctx.swEval(`Promise.all([chrome.runtime.sendMessage({target:'offscreen',type:'REC_STOP',turnId:${JSON.stringify(owner)}}),chrome.runtime.sendMessage({target:'offscreen',type:'REC_STOP',turnId:${JSON.stringify(owner)}})])`);
    await ctx.waitIdle(); await delay(300);
    assert.equal(await audioEval('__uploads'), 2, 'normal toggle/silence adjacency uploads only once');
    assert.equal((await audioEval('__audioEvents')).filter(e => e.type === 'finalize').length, 1);
  } finally {
    await audioEval('AnalyserNode.prototype.getFloatTimeDomainData=__sampleOriginal;AudioNode.prototype.connect=__connectOriginal;navigator.mediaDevices.getUserMedia=__captureOriginal;globalThis.fetch=__fetchOriginal;');
  }
}
export async function run(ctx) {
  const page = await ctx.openPage('/fixtures/tracking-form.html');
  await ctx.speak(page, 'kliknij Pokaż mapę'); await ctx.waitIdle();
  await captureAssertions(ctx, page);
  await lifecycleAssertions(ctx);
}
async function lifecycleAssertions(ctx) {
  const page = await ctx.openPage('/fixtures/sensitive.html');
  await ctx.speak(page, 'kliknij Zapłać');
  await ctx.waitForLive(page, 'Chcę kliknąć „Zapłać”. Potwierdzasz? Powiedz tak albo nie.');
  await ctx.waitIdle();
  assert(await ctx.swEval('chrome.storage.session.get("pending").then(s=>!!s.pending)'));
  assert((await ctx.swEval('globalThis.__lifecycleEvents')).some(e => e.kind === 'needs_confirmation' && e.route === 'cue'));
  await ctx.swEval('globalThis.__voiceAgentTest.stop()');
  await ctx.swEval('chrome.offscreen.closeDocument()');
  await ctx.swEval('chrome.storage.session.set({turn:{id:"audio-probe",tabId:1,phase:"processing",startedAt:Date.now()}})');
  assert.equal(await ctx.swEval('globalThis.__audioControlTest.sendCue("audio-probe","done")'), 'played', 'recreated document plays');
  let target = await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'));
  let session = await attach(ctx.client, target.id);
  let audioEval = expression => evaluate(ctx.client, session, expression);
  assert((await audioEval('__earconEvents')).some(e => e.kind === 'done' && e.type === 'played'));
  await ctx.swEval('globalThis.__closingCue=__audioControlTest.sendCue("audio-probe","needs_confirmation");true');
  await waitFor(async () => (await audioEval('__earconEvents')).some(e => e.kind === 'needs_confirmation' && e.type === 'start'), { label: 'source started before document closure' });
  await ctx.swEval('chrome.offscreen.closeDocument()');
  assert.equal(await ctx.swEval('__closingCue'), 'failed');
  assert.equal(await ctx.swEval('__audioControlTest.sendCue("audio-probe","done")'), 'played');
  const replacement = await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'));
  assert.notEqual(replacement.id, target.id, 'playing document is replaced');
  target = replacement; session = await attach(ctx.client, target.id); audioEval = expression => evaluate(ctx.client, session, expression);
  // Hold browser TTS at its terminal-event boundary. Source start/end are observed in real Web Audio.
  await ctx.swEval(`(() => {
    globalThis.__originalSpeak=chrome.tts.speak;globalThis.__originalVoices=chrome.tts.getVoices;globalThis.__ttsTimes=[];
    chrome.tts.getVoices=async()=>[{lang:'pl-PL',voiceName:'Test voice'}];
    chrome.tts.speak=(text,options)=>{__ttsTimes.push({type:'start',at:Date.now()});globalThis.__ttsEnd=()=>{__ttsTimes.push({type:'end',at:Date.now()});options.onEvent({type:'end'});};};
    return chrome.storage.local.set({outputMode:'browser_tts'});
  })()`);
  try {
    // Route change intentionally cancels the old owner; establish a fresh probe after its urgent cleanup.
    await ctx.waitIdle();
    await ctx.swEval('chrome.storage.session.set({turn:{id:"tts-probe",tabId:1,phase:"processing",startedAt:Date.now()}})');
    await ctx.swEval('chrome.offscreen.closeDocument()');
    await ctx.swEval('globalThis.__heldLine=__voiceAgentTest.deliverOutput("tts-probe",undefined,"To strona.","status");true');
    await waitFor(async () => (await ctx.swEval('__ttsTimes')).some(e => e.type === 'start'), { label: 'native TTS accepted but not ended' });
    target = await waitForTarget(ctx.browser.port, t => t.url.endsWith('/offscreen/offscreen.html'));
    session = await attach(ctx.client, target.id); audioEval = expression => evaluate(ctx.client, session, expression);
    await ctx.swEval('globalThis.__heldCue=__audioControlTest.sendCue("tts-probe","working");true');
    await delay(100);
    assert.equal((await audioEval('globalThis.__earconEvents??[]')).filter(e => e.type === 'start').length, 0);
    await ctx.swEval('__ttsEnd();true');
    assert.deepEqual(await ctx.swEval('Promise.all([__heldLine,__heldCue])'), ['delivered', 'played']);
    const events = await audioEval('__earconEvents.map(e=>({...e,at:performance.timeOrigin+e.at}))');
    const terminal = (await ctx.swEval('__ttsTimes')).find(e => e.type === 'end');
    assert(events.find(e => e.type === 'start').at >= terminal.at, 'oscillator starts only after terminal TTS');
    assert(events.some(e => e.type === 'played'));
  } finally {
    await ctx.swEval('chrome.tts.speak=__originalSpeak;chrome.tts.getVoices=__originalVoices;chrome.storage.local.set({outputMode:"screen_reader"})');
    await ctx.swEval('__voiceAgentTest.stop()');
  }
}
