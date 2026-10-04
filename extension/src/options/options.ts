import { COMMAND_TOGGLE } from '../shared/protocol.ts';
import { OPTIONS_MIC_GRANTED, OPTIONS_MIC_BLOCKED, OPTIONS_MIC_NO_DEVICE, OPTIONS_SHORTCUT_MISSING, optionsShortcut } from '../shared/messages.pl.ts';
import { SPEECH_OUTPUT_KEY, decodeSpeechOutput, getSpeechOutput } from '../shared/speech.ts';
const button = document.querySelector<HTMLButtonElement>('#grant-mic')!;
const status = document.querySelector<HTMLElement>('#mic-status')!; // role=status in semantic HTML
button.addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());
    status.textContent = OPTIONS_MIC_GRANTED;
  } catch (error) {
    const name = error instanceof DOMException ? error.name : '';
    status.textContent = ['NotAllowedError', 'SecurityError'].includes(name) ? OPTIONS_MIC_BLOCKED : OPTIONS_MIC_NO_DEVICE;
  }
});
void chrome.commands.getAll().then(commands => {
  const key = commands.find(command => command.name === COMMAND_TOGGLE)?.shortcut;
  document.querySelector('#shortcut-info')!.textContent = key ? optionsShortcut(key) : OPTIONS_SHORTCUT_MISSING;
}).catch(() => { document.querySelector('#shortcut-info')!.textContent = OPTIONS_SHORTCUT_MISSING; });

const speechSelect = document.querySelector<HTMLSelectElement>('#speech-output')!;
const speechStatus = document.querySelector<HTMLElement>('#speech-status')!;
const testSpeech = document.querySelector<HTMLButtonElement>('#test-speech')!;
const saveSpeech = document.querySelector<HTMLButtonElement>('#save-speech')!;
void getSpeechOutput().then(mode => { speechSelect.value = mode; testSpeech.disabled = mode !== 'piper'; });
speechSelect.addEventListener('change', () => { testSpeech.disabled = speechSelect.value !== 'piper'; });
saveSpeech.addEventListener('click', async () => {
  saveSpeech.disabled = true;
  try {
    await chrome.runtime.sendMessage({ target: 'sw', type: 'SPEECH_STOP' });
    const mode = decodeSpeechOutput(speechSelect.value);
    await chrome.storage.local.set({ [SPEECH_OUTPUT_KEY]: mode });
    testSpeech.disabled = mode !== 'piper';
    speechStatus.textContent = 'Ustawienia głosu zapisane.';
  } catch { speechStatus.textContent = 'Nie udało się zapisać ustawień głosu. Spróbuj ponownie.'; }
  finally { saveSpeech.disabled = false; }
});
testSpeech.addEventListener('click', async () => {
  if (await getSpeechOutput() !== 'piper') { speechStatus.textContent = 'Najpierw zapisz wybór głosu Pipera.'; return; }
  testSpeech.disabled = true;
  speechStatus.textContent = 'Testuję głos Pipera.';
  try {
    const result = await chrome.runtime.sendMessage({ target: 'sw', type: 'SPEAK', text: 'Dzień dobry. Tu FastEcho. Lokalny głos Piper jest gotowy.' });
    speechStatus.textContent = result?.ok === true ? 'Test głosu zakończony.' : result?.cancelled === true ? 'Test głosu przerwany.' : 'Piper jest niedostępny. Sprawdź lokalny serwis głosu.';
  } catch { speechStatus.textContent = 'Nie udało się przetestować głosu. Spróbuj ponownie.'; }
  finally { testSpeech.disabled = speechSelect.value !== 'piper'; }
});
