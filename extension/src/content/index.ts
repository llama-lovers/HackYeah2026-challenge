import { createAnnouncer } from './live-region.ts';
import { takeSnapshot } from './snapshot.ts';
import { execute } from './executor.ts';
import type { ToContent } from '../shared/protocol.ts';
const globals = globalThis as typeof globalThis & { __voiceAgentInitialized?: boolean };
if (!globals.__voiceAgentInitialized) {
  globals.__voiceAgentInitialized = true;
  const announcer = createAnnouncer(document);
  chrome.runtime.onMessage.addListener((message: ToContent, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    switch (message.type) {
      case 'PING': respond({ ok: true }); break;
      case 'ANNOUNCE': announcer.announce(message.text); respond({ ok: true }); break;
      case 'SNAPSHOT':
        try { respond({ ok: true, snapshot: takeSnapshot(document, { excludeRoot: announcer.host }) }); }
        catch { respond({ ok: false, error: 'snapshot_failed' }); }
        break;
      case 'EXECUTE':
        void execute(message.epoch, message.proposal, announcer).then(respond).catch(() => respond({ ok: false, reason: 'not_found' }));
        return true;
    }
  });
}
