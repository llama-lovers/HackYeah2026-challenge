import { COMMAND_STOP, COMMAND_TOGGLE, isFromOffscreen } from '../shared/protocol.ts';
import { announce, deliverOutput, handleOutputRequest, getTurn, handleStop, handleToggle, handleOffscreenMessage, handleReady, handleExecuting, handleTabRemoved, rehydrateWait } from './pipeline.ts';
import { OUTPUT_MODE_KEY, decodeOutputMode } from '../shared/settings.ts';
const handleCommand = (command: string, tab?: chrome.tabs.Tab) => {
  if (command === COMMAND_STOP) { void handleStop(); return; }
  if (command === COMMAND_TOGGLE && tab?.id !== undefined) void handleToggle(tab);
};
chrome.commands.onCommand.addListener(handleCommand);
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id === chrome.runtime.id && message?.type === 'OUTPUT' && sender.tab?.id !== undefined && sender.frameId === 0) {
    void handleOutputRequest(sender.tab.id, message).then(ok => respond({ ok }), () => respond({ ok: false })); return true;
  }
  if (sender.id === chrome.runtime.id && sender.tab === undefined && sender.url === chrome.runtime.getURL('options/options.html') && message?.type === 'SET_OUTPUT_MODE' && ['screen_reader', 'browser_tts'].includes(message.mode)) {
    void handleStop().then(() => chrome.storage.local.set({ [OUTPUT_MODE_KEY]: message.mode })).then(() => respond({ ok: true }), () => respond({ ok: false })); return true;
  }
  if (sender.id === chrome.runtime.id && isFromOffscreen(message)) void handleOffscreenMessage(message);
  if (sender.id === chrome.runtime.id && message?.type === 'READY' && sender.tab?.id !== undefined && sender.frameId === 0) void handleReady(sender.tab.id);
  if (sender.id === chrome.runtime.id && message?.type === 'EXECUTING' && typeof message.turnId === 'string' && typeof message.jobId === 'string' && sender.tab?.id !== undefined && sender.frameId === 0) {
    void handleExecuting(sender.tab.id, message).then(ok => respond({ ok }), () => respond({ ok: false }));
    return true;
  }
});
chrome.tabs.onRemoved.addListener(tabId => { void handleTabRemoved(tabId); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && OUTPUT_MODE_KEY in changes && decodeOutputMode(changes[OUTPUT_MODE_KEY]?.oldValue) !== decodeOutputMode(changes[OUTPUT_MODE_KEY]?.newValue)) void handleStop().catch(() => {});
});
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
    deliverOutput,
    async toggle(opts?: { stubText?: string }) {
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (tab) await handleToggle(tab, opts);
    },
    state: getTurn,
  } });
}
