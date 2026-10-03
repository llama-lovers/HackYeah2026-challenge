import { COMMAND_TOGGLE } from '../shared/protocol.ts';
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
  document.querySelector('#shortcut-info')!.textContent = key ? optionsShortcut(key) : OPTIONS_SHORTCUT_MISSING;
}).catch(() => { document.querySelector('#shortcut-info')!.textContent = OPTIONS_SHORTCUT_MISSING; });
