export type OutputMode = 'screen_reader' | 'browser_tts';
export const OUTPUT_MODE_KEY = 'outputMode';
export const DEFAULT_OUTPUT_MODE: OutputMode = 'screen_reader';
export function decodeOutputMode(value: unknown): OutputMode { return value === 'browser_tts' ? 'browser_tts' : DEFAULT_OUTPUT_MODE; }
// Reversible planned default; the user can disable all five cues.
export const EARCONS_KEY = 'earconsEnabled';
export const DEFAULT_EARCONS_ENABLED = true;
export function decodeEarconsEnabled(value: unknown): boolean { return typeof value === 'boolean' ? value : DEFAULT_EARCONS_ENABLED; }
export const OUTPUT_RECOVERY_KEY = 'outputRecovery';
export type OutputRecovery = 'page_unsupported' | 'page_access' | 'voice_unavailable' | 'voice_failed' | 'storage';
export function decodeOutputRecovery(value: unknown): OutputRecovery | undefined {
  return typeof value === 'string' && ['page_unsupported', 'page_access', 'voice_unavailable', 'voice_failed', 'storage'].includes(value) ? value as OutputRecovery : undefined;
}
