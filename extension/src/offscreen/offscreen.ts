import type { FromOffscreenBody, ToOffscreen, RecordingCompletion } from '../shared/protocol.ts';
import { decodeTranscriptBody, sttCodeForStatus } from '../shared/protocol.ts';
import { downsample, encodeWav16 } from '../shared/wav.ts';
import { RECORDING_CAP_MS } from '../shared/limits.ts';
import { createSilenceDetector, SILENCE_SAMPLE_MS } from './silence.ts';
import { playEarcon, cancelEarcons } from './earcons.ts';
// One capture per turn. Every event it emits carries its turn id, and a capture of an older turn is discarded
// (microphone released, upload aborted, no further events) as soon as a different turn starts.
interface Capture {
  turnId: string; state: 'opening' | 'recording' | 'uploading'; discarded: boolean; stopRequested: boolean; failed: boolean; stubText?: string;
  abort: AbortController; timer?: ReturnType<typeof setTimeout>; stream?: MediaStream; recorder?: MediaRecorder;
  context?: AudioContext; source?: MediaStreamAudioSourceNode; processor?: ScriptProcessorNode; wavChunks: Float32Array[];
  analyser?: AnalyserNode; poller?: ReturnType<typeof setInterval>; opened: boolean; finalized: boolean; reason?: RecordingCompletion;
  releasePromise?: Promise<void>; closeCuePlayed?: boolean;
}
let current: Capture | undefined;
function mark(c: Capture, type: string, detail?: unknown) { if (__E2E__) { const g = globalThis as typeof globalThis & { __audioEvents?: unknown[] }; const events = g.__audioEvents ??= []; events.push({ turnId: c.turnId, type, detail, at: performance.now() }); if (events.length > 200) events.shift(); } }
const emit = (c: Capture, body: FromOffscreenBody): Promise<void> => c.discarded ? Promise.resolve() : chrome.runtime.sendMessage({ target: 'sw', turnId: c.turnId, ...body }).then(() => {}, () => {});
function release(c: Capture): Promise<void> {
  if (c.releasePromise) return c.releasePromise;
  // Permission may still be pending: its eventual stream must get its own release.
  if (!c.stream && !c.context) return Promise.resolve();
  clearTimeout(c.timer);
  clearInterval(c.poller); c.analyser?.disconnect();
  c.source?.disconnect(); c.processor?.disconnect();
  if (c.processor) c.processor.onaudioprocess = null;
  c.stream?.getTracks().forEach(track => track.stop());
  const context = c.context;
  c.source = undefined; c.processor = undefined; c.stream = undefined; c.context = undefined;
  cancelEarcons(c.turnId);
  const closed = context ? context.close().catch(() => {}) : Promise.resolve();
  c.releasePromise = (async () => {
    if (c.opened) { mark(c, 'mic_close'); c.closeCuePlayed = await playEarcon('mic_close', c.turnId) === 'played'; }
    await closed;
  })();
  return c.releasePromise;
}
function discard(c: Capture) {
  c.discarded = true; c.abort.abort(); void release(c);
  c.wavChunks = [];
  if (c.recorder && c.recorder.state !== 'inactive') {
    c.recorder.ondataavailable = null; c.recorder.onstop = null; c.recorder.onerror = null;
    try { c.recorder.stop(); } catch { /* already stopped */ }
  }
  if (current === c) current = undefined;
}
async function upload(c: Capture, blob: Blob) {
  if (c.discarded || c.abort.signal.aborted) return;
  if (blob.size < 1000) { await emit(c, { type: 'TRANSCRIPT', text: '' }); return; }
  let response: Response;
  try {
    response = await fetch(__PROXY_URL__ + '/api/transcribe' + (__E2E__ && c.stubText !== undefined ? '?text=' + encodeURIComponent(c.stubText) : ''), {
      method: 'POST', body: blob, headers: { 'Content-Type': blob.type }, signal: AbortSignal.any([c.abort.signal, AbortSignal.timeout(25000)]),
    });
  } catch (error) { await emit(c, { type: 'TRANSCRIBE_ERROR', code: error instanceof DOMException && error.name === 'TimeoutError' ? 'stt_timeout' : 'network' }); return; }
  if (!response.ok) { await emit(c, { type: 'TRANSCRIBE_ERROR', code: sttCodeForStatus(response.status) }); return; }
  // An empty transcript is a legitimate "nothing heard"; a body that does not decode (or is absurdly long) is a provider fault.
  let text: string | null;
  try { text = decodeTranscriptBody(await response.json()); } catch { text = null; }
  await emit(c, text === null ? { type: 'TRANSCRIBE_ERROR', code: 'stt_invalid' } : { type: 'TRANSCRIPT', text });
}
async function transcribe(c: Capture, blob: Blob) {
  c.state = 'uploading';
  mark(c, 'finalize', c.reason);
  await emit(c, { type: 'REC_STOPPED', reason: c.reason, closeCuePlayed: c.closeCuePlayed });
  if (c.discarded) return;
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
function stop(c: Capture, reason: RecordingCompletion = 'toggle') {
  if (c.discarded) return;
  if (c.state === 'opening') { c.stopRequested = true; c.reason ??= reason; return; }
  if (c.state !== 'recording' || c.finalized) return;
  c.finalized = true; c.reason ??= reason; c.state = 'uploading'; clearInterval(c.poller); clearTimeout(c.timer);
  if (c.recorder) { if (c.recorder.state === 'recording') c.recorder.stop(); }
  else void finishWav(c);
}
async function recordingStarted(c: Capture) {
  if (c.discarded) return;
  c.state = 'recording'; c.opened = true; mark(c, 'mic_open');
  c.timer = setTimeout(() => stop(c, 'cap'), RECORDING_CAP_MS);
  const cuePlayed = await playEarcon('mic_open', c.turnId) === 'played';
  if (c.discarded || c.finalized) return;
  const detector = createSilenceDetector(), samples = new Float32Array(c.analyser!.fftSize);
  c.poller = setInterval(() => {
    if (c.state !== 'recording' || c.discarded) return;
    c.analyser!.getFloatTimeDomainData(samples);
    const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
    if (detector.sample(performance.now(), rms)) stop(c, 'silence');
  }, SILENCE_SAMPLE_MS);
  await emit(c, { type: 'MIC_OPEN', cuePlayed });
  if (c.stopRequested) stop(c, c.reason);
}
async function start(turnId: string) {
  if (current?.turnId === turnId) return;
  if (current) discard(current);
  cancelEarcons();
  const c: Capture = { turnId, state: 'opening', discarded: false, stopRequested: false, failed: false, opened: false, finalized: false, abort: new AbortController(), wavChunks: [] };
  current = c;
  try {
    c.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    if (c.discarded) { void release(c); return; }
    c.context = new AudioContext();
    c.source = c.context.createMediaStreamSource(c.stream);
    c.analyser = c.context.createAnalyser(); c.analyser.fftSize = 2048;
    c.source.connect(c.analyser); // Deliberately no analysis path to destination.
    await c.context.resume();
    if (c.discarded) { void release(c); return; }
    if (__AUDIO_FORMAT__ === 'wav') {
      c.processor = c.context.createScriptProcessor(4096, 1, 1);
      c.processor.onaudioprocess = event => { event.outputBuffer.getChannelData(0).fill(0); if (!c.finalized && !c.discarded) c.wavChunks.push(new Float32Array(event.inputBuffer.getChannelData(0))); };
      c.source.connect(c.processor); c.processor.connect(c.context.destination);
      await c.context.resume();
      if (c.discarded) { void release(c); return; }
      await recordingStarted(c);
      return;
    }
    const chunks: Blob[] = [];
    const recorder = c.recorder = new MediaRecorder(c.stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onerror = () => {
      c.failed = true;
      void emit(c, { type: 'TRANSCRIBE_ERROR', code: 'not_recording' });
      discard(c);
    };
    recorder.onstart = () => { void recordingStarted(c); };
    recorder.onstop = async () => {
      await release(c);
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
  if (message.type === 'REC_DISCARD') { if (current && (message.turnId === undefined || message.turnId === current.turnId)) discard(current); return; }
  if (typeof message.turnId !== 'string' || !message.turnId || message.turnId.length > 64) return;
  if (message.type === 'REC_START') void start(message.turnId);
  else if (message.type === 'REC_STOP') {
    const c = current;
    if (c && c.turnId === message.turnId && (c.state === 'opening' || c.state === 'recording')) { if (__E2E__) c.stubText = message.stubText; stop(c); }
    else if (c?.turnId !== message.turnId) void chrome.runtime.sendMessage({ target: 'sw', turnId: message.turnId, type: 'TRANSCRIBE_ERROR', code: 'not_recording' }).catch(() => {});
  }
});
