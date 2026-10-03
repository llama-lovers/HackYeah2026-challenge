import { COMMAND_TOGGLE, isFromOffscreen } from '../shared/protocol.ts';
import { getTurn, handleToggle, handleOffscreenMessage, handleReady } from './pipeline.ts';
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === COMMAND_TOGGLE && tab?.id !== undefined) void handleToggle(tab);
});
chrome.runtime.onMessage.addListener((message, sender) => {
  if (sender.id === chrome.runtime.id && isFromOffscreen(message)) void handleOffscreenMessage(message);
  if (sender.id === chrome.runtime.id && message?.type === 'READY' && sender.tab?.id !== undefined && sender.frameId === 0) void handleReady(sender.tab.id);
});
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
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
