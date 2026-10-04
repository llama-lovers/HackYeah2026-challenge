import { ensureOffscreen } from './offscreen.ts';
import { isSpeechText } from '../shared/speech.ts';
import { SpeechPlayer } from '../offscreen/speech-player.ts';
import type { SpeechResult } from '../offscreen/speech-player.ts';
import { PIPER_UNAVAILABLE } from '../shared/messages.pl.ts';
let generation = 0;
const fallbackWaiters = new Set<() => void>();
// Serialize the complete delivery, including browser fallback. The offscreen
// queue alone cannot prevent Chrome TTS overlapping a later Piper response.
const output = new SpeechPlayer(async text => text, async (text, signal) => deliverPiper(text, signal));

function browserFallback(text: string, epoch: number): Promise<void> {
  return new Promise(resolve => {
    const finish = () => { clearTimeout(timer); fallbackWaiters.delete(finish); resolve(); };
    const timer = setTimeout(() => { if (epoch === generation) chrome.tts.stop?.(); finish(); }, 30000);
    fallbackWaiters.add(finish);
    try {
      chrome.tts.speak(PIPER_UNAVAILABLE + ' ' + text, { lang: 'pl-PL', rate: 1.0, enqueue: true,
        onEvent: event => { if (['end', 'interrupted', 'cancelled', 'error'].includes(event.type)) finish(); } });
    } catch { finish(); }
  });
}

export function speakPiper(text: string): Promise<SpeechResult> { return output.speak(text); }

async function deliverPiper(text: string, signal: AbortSignal): Promise<SpeechResult> {
  if (!isSpeechText(text)) return { ok: false };
  const epoch = generation;
  try {
    await ensureOffscreen();
    if (signal.aborted || epoch !== generation) return { ok: false, cancelled: true };
    const result = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'SPEECH_PLAY', text });
    if (signal.aborted || epoch !== generation) return { ok: false, cancelled: true };
    if (result?.ok === true) return { ok: true };
    if (result?.ok === false && result.cancelled === true) return { ok: false, cancelled: true };
  } catch { /* Only fixed messages reach the fallback voice. */ }
  if (signal.aborted || epoch !== generation) return { ok: false, cancelled: true };
  await browserFallback(text, epoch);
  return epoch === generation ? { ok: false } : { ok: false, cancelled: true };
}

// Interrupt outside the pipeline lock, including during a long announcement.
export async function stopSpeech(): Promise<void> {
  generation++;
  output.stop();
  chrome.tts.stop?.();
  for (const finish of fallbackWaiters) finish();
  try {
    if ((await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })).length) {
      await chrome.runtime.sendMessage({ target: 'offscreen', type: 'SPEECH_STOP' });
    }
  } catch { /* A closed document has no audio left to stop. */ }
}
