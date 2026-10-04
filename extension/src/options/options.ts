import { COMMAND_STOP, COMMAND_TOGGLE } from '../shared/protocol.ts';
import { OUTPUT_MODE_KEY, OUTPUT_RECOVERY_KEY, decodeOutputMode, decodeOutputRecovery } from '../shared/settings.ts';
import { OUTPUT_RECOVERY_TEXTS, STOP_LATENCY, OUTPUT_SAVED, OUTPUT_SAVE_FAILED } from '../shared/messages.pl.ts';
import { OPTIONS_MIC_GRANTED, OPTIONS_MIC_BLOCKED, OPTIONS_MIC_NO_DEVICE, OPTIONS_SHORTCUT_MISSING, optionsShortcut } from '../shared/messages.pl.ts';
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
  const stop = commands.find(command => command.name === COMMAND_STOP)?.shortcut;
  document.querySelector('#stop-shortcut-info')!.textContent = stop ? `Skrót zatrzymania: ${stop}. Zmienisz go na stronie chrome://extensions/shortcuts.` : 'Skrót zatrzymania nie jest ustawiony. Ustaw go na stronie chrome://extensions/shortcuts.';
  document.querySelector('#shortcut-info')!.textContent = key ? optionsShortcut(key) : OPTIONS_SHORTCUT_MISSING;
}).catch(() => { document.querySelector('#shortcut-info')!.textContent = OPTIONS_SHORTCUT_MISSING; });
document.querySelector('#stop-latency')!.textContent = STOP_LATENCY;
const mode = document.querySelector<HTMLSelectElement>('#output-mode')!;
void chrome.storage.local.get(OUTPUT_MODE_KEY).then(items => { mode.value = decodeOutputMode(items[OUTPUT_MODE_KEY]); }).catch(() => {
  mode.value = decodeOutputMode(undefined);
  document.querySelector('#output-status')!.textContent = OUTPUT_SAVE_FAILED;
});
mode.addEventListener('change', async () => {
  const requested = decodeOutputMode(mode.value); mode.disabled = true;
  try {
    const reply = await chrome.runtime.sendMessage({ type: 'SET_OUTPUT_MODE', mode: requested });
    if (reply?.ok !== true) throw new Error('save_failed');
    document.querySelector('#output-status')!.textContent = OUTPUT_SAVED;
  } catch { document.querySelector('#output-status')!.textContent = OUTPUT_SAVE_FAILED; }
  finally { mode.value = decodeOutputMode((await chrome.storage.local.get(OUTPUT_MODE_KEY).catch(() => ({} as Record<string, unknown>)))[OUTPUT_MODE_KEY]); mode.disabled = false; }
});
const recovery = document.querySelector<HTMLElement>('#output-recovery')!;
const acknowledgement = document.querySelector<HTMLButtonElement>('#ack-recovery')!;
async function showRecovery() {
  const items = await chrome.storage.session.get(OUTPUT_RECOVERY_KEY).catch(() => ({} as Record<string, unknown>));
  const code = decodeOutputRecovery(items[OUTPUT_RECOVERY_KEY]);
  if (!code) return;
  recovery.textContent = OUTPUT_RECOVERY_TEXTS[code]; recovery.hidden = false; acknowledgement.hidden = false;
  recovery.focus();
}
acknowledgement.addEventListener('click', async () => { await chrome.storage.session.remove(OUTPUT_RECOVERY_KEY); recovery.hidden = true; acknowledgement.hidden = true; button.focus(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && OUTPUT_RECOVERY_KEY in changes) void showRecovery();
  if (area === 'local' && OUTPUT_MODE_KEY in changes) mode.value = decodeOutputMode(changes[OUTPUT_MODE_KEY]?.newValue);
});
void showRecovery();
