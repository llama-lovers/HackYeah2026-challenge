import type { FromOffscreen, ToOffscreen, TranscribeResponse } from '../shared/protocol.ts';
let recorder: MediaRecorder | undefined;
let opening = false;
let stream: MediaStream | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let stubText: string | undefined;
let stopRequested = false;
const send = (message: Omit<FromOffscreen, 'target'>) => chrome.runtime.sendMessage({ target: 'sw', ...message });
async function upload(blob: Blob) {
  if (blob.size < 1000) { await send({ type: 'TRANSCRIPT', text: '' } as Omit<FromOffscreen, 'target'>); return; }
  try {
    const response = await fetch(__PROXY_URL__ + '/api/transcribe' + (__E2E__ && stubText !== undefined ? '?text=' + encodeURIComponent(stubText) : ''), {
      method: 'POST', body: blob, headers: { 'Content-Type': blob.type }, signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) { await send({ type: 'TRANSCRIBE_ERROR', code: [502, 504].includes(response.status) ? 'stt_failed' : 'network' } as Omit<FromOffscreen, 'target'>); return; }
    const body = await response.json() as TranscribeResponse;
    if (typeof body.text !== 'string') throw new Error('invalid_transcript');
    await send({ type: 'TRANSCRIPT', text: body.text } as Omit<FromOffscreen, 'target'>);
  } catch { await send({ type: 'TRANSCRIBE_ERROR', code: 'network' } as Omit<FromOffscreen, 'target'>); }
}
function stop() { if (opening) { stopRequested = true; return; } if (recorder?.state === 'recording') recorder.stop(); }
async function start() {
  if (opening || recorder?.state === 'recording') return;
  opening = true; stopRequested = false; stubText = undefined;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const chunks: Blob[] = [];
    recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
    recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    recorder.onstart = () => { void send({ type: 'MIC_OPEN' }); timer = setTimeout(stop, 15000); if (stopRequested) stop(); };
    recorder.onstop = async () => {
      clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      recorder = undefined; stream = undefined;
      await send({ type: 'REC_STOPPED' });
      await upload(new Blob(chunks, { type: 'audio/webm;codecs=opus' }));
    };
    opening = false;
    recorder.start();
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    stream = undefined; recorder = undefined;
    const name = error instanceof DOMException ? error.name : '';
    await send({ type: 'MIC_ERROR', code: ['NotAllowedError', 'SecurityError'].includes(name) ? 'not_allowed' : name === 'NotFoundError' ? 'no_device' : 'other' } as Omit<FromOffscreen, 'target'>);
  } finally { opening = false; }
}
chrome.runtime.onMessage.addListener((message: ToOffscreen, sender) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'offscreen') return;
  if (message.type === 'REC_START') void start();
  else if (message.type === 'REC_STOP') {
    if (__E2E__) stubText = message.stubText;
    if (opening || recorder?.state === 'recording') stop();
    else void send({ type: 'TRANSCRIBE_ERROR', code: 'not_recording' } as Omit<FromOffscreen, 'target'>);
  }
});
