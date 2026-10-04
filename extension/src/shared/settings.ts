export type OutputMode = 'screen_reader' | 'browser_tts';
export const OUTPUT_MODE_KEY = 'outputMode';
export const DEFAULT_OUTPUT_MODE: OutputMode = 'screen_reader';
export function decodeOutputMode(value: unknown): OutputMode { return value === 'browser_tts' ? 'browser_tts' : DEFAULT_OUTPUT_MODE; }
export const OUTPUT_RECOVERY_KEY = 'outputRecovery';
export type OutputRecovery = 'page_unsupported' | 'page_access' | 'voice_unavailable' | 'voice_failed' | 'storage';
export function decodeOutputRecovery(value: unknown): OutputRecovery | undefined {
  return typeof value === 'string' && ['page_unsupported', 'page_access', 'voice_unavailable', 'voice_failed', 'storage'].includes(value) ? value as OutputRecovery : undefined;
}
