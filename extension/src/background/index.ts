import { COMMAND_TOGGLE, isFromOffscreen } from '../shared/protocol.ts';
import { getTurn, handleToggle, handleOffscreenMessage, handleReady, handleExecuting, handleTabRemoved, rehydrateWait, ensureOffscreen } from './pipeline.ts';
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== COMMAND_TOGGLE) return;
  if (tab?.id !== undefined) void handleToggle(tab);
  else void chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([active]) => {
    if (active) return handleToggle(active);
  }).catch(() => {});
});
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id === chrome.runtime.id && isFromOffscreen(message)) void handleOffscreenMessage(message);
  if (sender.id === chrome.runtime.id && message?.type === 'READY' && sender.tab?.id !== undefined && sender.frameId === 0) void handleReady(sender.tab.id);
  if (sender.id === chrome.runtime.id && message?.type === 'EXECUTING' && typeof message.turnId === 'string' && typeof message.jobId === 'string' && sender.tab?.id !== undefined && sender.frameId === 0) {
    void handleExecuting(sender.tab.id, message).then(ok => respond({ ok }), () => respond({ ok: false }));
    return true;
  }
});
chrome.tabs.onRemoved.addListener(tabId => { void handleTabRemoved(tabId); });
// A worker that was killed and woken keeps the processing deadline of the turn it still owns.
void rehydrateWait().catch(() => {});
// Prepare the recording document when the worker wakes; do not request microphone access.
void ensureOffscreen().catch(() => {});
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
