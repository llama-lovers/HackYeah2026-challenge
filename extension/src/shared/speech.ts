export const SPEECH_OUTPUT_KEY = 'speechOutput';
export type SpeechOutput = 'screen_reader' | 'piper';
export function decodeSpeechOutput(value: unknown): SpeechOutput { return value === 'piper' ? 'piper' : 'screen_reader'; }
export async function getSpeechOutput(): Promise<SpeechOutput> {
  try { return decodeSpeechOutput((await chrome.storage.local.get(SPEECH_OUTPUT_KEY))[SPEECH_OUTPUT_KEY]); }
  catch { return 'screen_reader'; }
}
export function isSpeechText(text: unknown): text is string {
  return typeof text === 'string' && text.trim().length > 0 && text.length <= 4000;
}
