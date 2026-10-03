import type { FromOffscreenBody, ToOffscreen, TranscribeResponse } from '../shared/protocol.ts';
import { downsample, encodeWav16 } from '../shared/wav.ts';
// One capture per turn. Every event it emits carries its turn id, and a capture of an older turn is discarded
// (microphone released, upload aborted, no further events) as soon as a different turn starts.
interface Capture {
  turnId: string; state: 'opening' | 'recording' | 'uploading'; discarded: boolean; stopRequested: boolean; failed: boolean; stubText?: string;
  abort: AbortController; timer?: ReturnType<typeof setTimeout>; stream?: MediaStream; recorder?: MediaRecorder;
  context?: AudioContext; source?: MediaStreamAudioSourceNode; processor?: ScriptProcessorNode; wavChunks: Float32Array[];
}
let current: Capture | undefined;
const emit = (c: Capture, body: FromOffscreenBody): Promise<void> => c.discarded ? Promise.resolve() : chrome.runtime.sendMessage({ target: 'sw', turnId: c.turnId, ...body }).then(() => {}, () => {});
function release(c: Capture): Promise<void> {
  clearTimeout(c.timer);
  c.source?.disconnect(); c.processor?.disconnect();
  if (c.processor) c.processor.onaudioprocess = null;
  c.stream?.getTracks().forEach(track => track.stop());
  const context = c.context;
  c.source = undefined; c.processor = undefined; c.stream = undefined; c.context = undefined;
  return context ? context.close().catch(() => {}) : Promise.resolve();
}
function discard(c: Capture) {
  c.discarded = true; c.abort.abort(); void release(c);
  if (c.recorder && c.recorder.state !== 'inactive') {
    c.recorder.ondataavailable = null; c.recorder.onstop = null; c.recorder.onerror = null;
    try { c.recorder.stop(); } catch { /* already stopped */ }
  }
  if (current === c) current = undefined;
}
async function upload(c: Capture, blob: Blob) {
  if (blob.size < 1000) { await emit(c, { type: 'TRANSCRIPT', text: '' }); return; }
  try {
    const response = await fetch(__PROXY_URL__ + '/api/transcribe' + (__E2E__ && c.stubText !== undefined ? '?text=' + encodeURIComponent(c.stubText) : ''), {
      method: 'POST', body: blob, headers: { 'Content-Type': blob.type }, signal: AbortSignal.any([c.abort.signal, AbortSignal.timeout(25000)]),
    });
    if (!response.ok) { await emit(c, { type: 'TRANSCRIBE_ERROR', code: [502, 504].includes(response.status) ? 'stt_failed' : 'network' }); return; }
    const body = await response.json() as TranscribeResponse;
    if (typeof body.text !== 'string') throw new Error('invalid_transcript');
    await emit(c, { type: 'TRANSCRIPT', text: body.text });
  } catch { await emit(c, { type: 'TRANSCRIBE_ERROR', code: 'network' }); }
}
async function transcribe(c: Capture, blob: Blob) {
  c.state = 'uploading';
  await emit(c, { type: 'REC_STOPPED' });
  await upload(c, blob);
  if (current === c) current = undefined;
}
async function finishWav(c: Capture) {
  const rate = c.context?.sampleRate ?? 16000;
  c.state = 'uploading';
  await release(c);
  if (c.discarded) return;
  const samples = new Float32Array(c.wavChunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of c.wavChunks) { samples.set(chunk, offset); offset += chunk.length; }
  c.wavChunks = [];
  await transcribe(c, new Blob([encodeWav16(downsample(samples, rate, 16000), 16000)], { type: 'audio/wav' }));
}
function stop(c: Capture) {
  if (c.discarded) return;
  if (c.state === 'opening') { c.stopRequested = true; return; }
  if (c.state !== 'recording') return;
  if (c.recorder) { if (c.recorder.state === 'recording') c.recorder.stop(); }
  else void finishWav(c);
}
async function start(turnId: string) {
  if (current?.turnId === turnId) return;
  if (current) discard(current);
  const c: Capture = { turnId, state: 'opening', discarded: false, stopRequested: false, failed: false, abort: new AbortController(), wavChunks: [] };
  current = c;
  try {
    c.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    if (c.discarded) { void release(c); return; }
    if (__AUDIO_FORMAT__ === 'wav') {
      c.context = new AudioContext();
      c.source = c.context.createMediaStreamSource(c.stream);
      c.processor = c.context.createScriptProcessor(4096, 1, 1);
      c.processor.onaudioprocess = event => { c.wavChunks.push(new Float32Array(event.inputBuffer.getChannelData(0))); };
      c.source.connect(c.processor); c.processor.connect(c.context.destination);
      await c.context.resume();
      if (c.discarded) { void release(c); return; }
      c.state = 'recording';
      await emit(c, { type: 'MIC_OPEN' });
      c.timer = setTimeout(() => stop(c), 15000);
      if (c.stopRequested) stop(c);
      return;
    }
    const chunks: Blob[] = [];
    const recorder = c.recorder = new MediaRecorder(c.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => {
      c.failed = true;
      void emit(c, { type: 'TRANSCRIBE_ERROR', code: 'stt_failed' });
      discard(c);
    };
    recorder.onstart = () => { c.state = 'recording'; void emit(c, { type: 'MIC_OPEN' }); c.timer = setTimeout(() => stop(c), 15000); if (c.stopRequested) stop(c); };
    recorder.onstop = async () => {
      void release(c);
      if (c.discarded || c.failed) return;
      await transcribe(c, new Blob(chunks, { type: 'audio/webm;codecs=opus' }));
    };
    recorder.start();
  } catch (error) {
    void release(c);
    if (current === c) current = undefined;
    if (c.discarded) return;
    const name = error instanceof DOMException ? error.name : '';
    await emit(c, { type: 'MIC_ERROR', code: ['NotAllowedError', 'SecurityError'].includes(name) ? 'not_allowed' : name === 'NotFoundError' ? 'no_device' : 'other' });
  }
}
chrome.runtime.onMessage.addListener((message: ToOffscreen, sender) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'offscreen') return;
  if (message.type === 'REC_START') void start(message.turnId);
  else if (message.type === 'REC_STOP') {
    const c = current;
    if (c && c.turnId === message.turnId && (c.state === 'opening' || c.state === 'recording')) { if (__E2E__) c.stubText = message.stubText; stop(c); }
    else void chrome.runtime.sendMessage({ target: 'sw', turnId: message.turnId, type: 'TRANSCRIBE_ERROR', code: 'not_recording' }).catch(() => {});
  }
});
