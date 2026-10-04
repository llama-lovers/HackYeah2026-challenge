export type SilenceDetectorState = 'waiting_for_speech' | 'speaking' | 'trailing_silence';
export interface SilenceDetectorConfig { threshold: number; onsetMs: number; trailingMs: number }
// Acoustic tuning defaults, not microphone-independent speech recognition.
export const SILENCE_PROFILE: Readonly<SilenceDetectorConfig> = { threshold: 0.02, onsetMs: 160, trailingMs: 1200 };
export const SILENCE_SAMPLE_MS = 50;
export function createSilenceDetector(config: SilenceDetectorConfig = SILENCE_PROFILE) {
  if (!Number.isFinite(config.threshold) || config.threshold <= 0 || !Number.isFinite(config.onsetMs) || config.onsetMs <= 0 || !Number.isFinite(config.trailingMs) || config.trailingMs <= 0) throw new RangeError('invalid_silence_profile');
  let state: SilenceDetectorState = 'waiting_for_speech', onset: number | undefined, quiet: number | undefined;
  let last = -Infinity, finished = false;
  return {
    get state(): SilenceDetectorState { return state; },
    sample(now: number, rms: number): boolean {
      if (finished || !Number.isFinite(now) || !Number.isFinite(rms) || rms < 0 || now < last) return false;
      last = now;
      if (state === 'waiting_for_speech') {
        if (rms < config.threshold) onset = undefined;
        else { onset ??= now; if (now - onset >= config.onsetMs) state = 'speaking'; }
      } else if (rms >= config.threshold) { state = 'speaking'; quiet = undefined; }
      else {
        state = 'trailing_silence'; quiet ??= now;
        if (now - quiet >= config.trailingMs) { finished = true; return true; }
      }
      return false;
    },
  };
}
