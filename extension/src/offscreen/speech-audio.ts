export async function synthesizeSpeech(text: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(__PROXY_URL__ + '/api/speak', { method: 'POST',
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(16000)]) });
  if (!response.ok || !response.headers.get('content-type')?.startsWith('audio/wav')) throw new Error('speech_unavailable');
  const audio = await response.arrayBuffer();
  if (!audio.byteLength || audio.byteLength > 8 * 1024 * 1024) throw new Error('speech_invalid');
  return audio;
}

export async function playSpeech(audio: ArrayBuffer, signal: AbortSignal): Promise<void> {
  const context = new AudioContext();
  let source: AudioBufferSourceNode | undefined;
  let cleanup = () => {};
  try {
    const buffer = await context.decodeAudioData(audio);
    if (signal.aborted) return;
    await context.resume();
    if (signal.aborted) return;
    source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
    await new Promise<void>((resolve, reject) => {
      const stop = () => { try { source?.stop(); } catch { /* not started */ } resolve(); };
      const timer = setTimeout(() => { reject(new Error('speech_timeout')); stop(); }, 60000);
      cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', stop); };
      signal.addEventListener('abort', stop, { once: true });
      source!.onended = () => resolve();
      source!.start();
    });
  } finally {
    cleanup();
    if (source) { source.onended = null; source.disconnect(); }
    await context.close().catch(() => {});
  }
}
