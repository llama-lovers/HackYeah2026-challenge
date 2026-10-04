import { COMMAND_STOP, COMMAND_TOGGLE, isFromOffscreen } from '../shared/protocol.ts';
import { announce, getTurn, handleStop, handleToggle, handleOffscreenMessage, handleReady, handleExecuting, handleTabRemoved, rehydrateWait } from './pipeline.ts';
const handleCommand = (command: string, tab?: chrome.tabs.Tab) => {
  if (command === COMMAND_STOP) { void handleStop(); return; }
  if (command === COMMAND_TOGGLE && tab?.id !== undefined) void handleToggle(tab);
};
chrome.commands.onCommand.addListener(handleCommand);
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
chrome.runtime.onInstalled.addListener(details => {
  if (details.reason === 'install') void chrome.runtime.openOptionsPage();
});
if (__E2E__) {
  Object.assign(globalThis, { __voiceAgentTest: {
    stop: handleStop,
    command: handleCommand,
    announce,
    async toggle(opts?: { stubText?: string }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab) await handleToggle(tab, opts);
    },
    state: getTurn,
  } });
}
