import { COMMAND_TOGGLE, isFromOffscreen } from '../shared/protocol.ts';
import { getTurn, handleToggle, handleOffscreenMessage } from './pipeline.ts';
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === COMMAND_TOGGLE && tab?.id !== undefined) void handleToggle(tab);
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === chrome.runtime.id && isFromOffscreen(message)) void handleOffscreenMessage(message);
});
if (__E2E__) {
  Object.assign(globalThis, { __voiceAgentTest: {
    async toggle(opts?: { stubText?: string }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab) await handleToggle(tab, opts);
    },
    state: getTurn,
  } });
}
