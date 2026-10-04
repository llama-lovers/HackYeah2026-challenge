import { createAnnouncer } from './live-region.ts';
import { takeSnapshot, getDocumentId } from './snapshot.ts';
import { execute } from './executor.ts';
import { startSettleWatch } from './settle.ts';
import { diffSnapshots } from '../shared/diff.ts';
import type { ToContent } from '../shared/protocol.ts';
import { isParcelDigits } from '../shared/parcel.ts';
import { waitForParcelStatus } from './tracking.ts';
import { projectCandidates, recheckCandidates } from './candidates.ts';
import { scrollDocument } from './scroll.ts';
import { decodeScrollRequest } from '../shared/protocol.ts';
import { SCROLL_PRE } from '../shared/messages.pl.ts';
const globals = globalThis as typeof globalThis & { __voiceAgentInitialized?: boolean };
if (!globals.__voiceAgentInitialized) {
  globals.__voiceAgentInitialized = true;
  const announcer = createAnnouncer(document);
  chrome.runtime.onMessage.addListener((message: ToContent, sender, respond) => {
    if (sender.id !== chrome.runtime.id) return;
    switch (message.type) {
      case 'READ_STATUS':
        if (!isParcelDigits(message.number)) { respond({ ok: false, error: 'invalid_number' }); break; }
        void waitForParcelStatus(document, message.number).then(respond).catch(() => respond({ ok: false, error: 'not_found' }));
        return true;
      case 'PING': respond({ ok: true, docId: getDocumentId(), url: location.href }); break;
      case 'ANNOUNCE':
        // The acknowledgement follows the queued live-region mutation, so the worker may treat the text as delivered.
        if (typeof message.text !== 'string') { respond({ ok: false }); break; }
        void announcer.announce(message.text).then(() => respond({ ok: true, docId: getDocumentId() }), () => respond({ ok: false }));
        return true;
      case 'SNAPSHOT':
        try { respond({ ok: true, snapshot: takeSnapshot(document, { excludeRoot: announcer.host }), docId: getDocumentId() }); }
        catch { respond({ ok: false, error: 'snapshot_failed' }); }
        break;
      case 'CANDIDATES':
        try {
          const snapshot = takeSnapshot(document, { excludeRoot: announcer.host });
          const { candidates, incomplete } = projectCandidates(snapshot);
          respond({ ok: true, snapshot, docId: getDocumentId(), candidates, incomplete: incomplete || snapshot.truncated });
        } catch { respond({ ok: false, error: 'snapshot_failed' }); }
        break;
      case 'RECHECK_CANDIDATES': {
        // Suggestions are only meaningful for the document and snapshot epoch they were projected from.
        const ids = Array.isArray(message.ids) && message.ids.length <= 8 && message.ids.every(id => typeof id === 'string' && id.length <= 32) ? message.ids : null;
        if (!ids || typeof message.epoch !== 'number' || message.docId !== getDocumentId()) { respond({ ok: false, reason: 'stale' }); break; }
        try { const candidates = recheckCandidates(message.epoch, ids); respond(candidates ? { ok: true, candidates } : { ok: false, reason: 'stale' }); }
        catch { respond({ ok: false, reason: 'stale' }); }
        break;
      }
      case 'SCROLL': {
        // Only the worker (no tab sender) may ask, only for the top-level document it named, and a reload in between makes the request stale.
        const request = decodeScrollRequest(message);
        if (!request || sender.tab !== undefined || window !== window.top) { respond({ ok: false, reason: 'invalid' }); break; }
        if (request.docId !== getDocumentId()) { respond({ ok: false, reason: 'stale' }); break; }
        void (async () => {
          await announcer.announce(SCROLL_PRE);
          return scrollDocument(request.direction, { docId: request.docId, currentDocId: getDocumentId });
        })().then(respond, () => respond({ ok: false, reason: 'stale' }));
        return true;
      }
      case 'EXECUTE':
        // A proposal made against another document instance (reload, SPA hard navigation) must not act here.
        if (message.docId !== getDocumentId()) { respond({ ok: false, reason: 'stale' }); break; }
        void execute(message.epoch, message.proposal, announcer, async () => {
          try { return ((await chrome.runtime.sendMessage({ type: 'EXECUTING', turnId: message.turnId, jobId: message.jobId })) as { ok?: boolean } | undefined)?.ok === true; } catch { return false; }
        }, { confirmed: message.confirmed === true, context: message.context }).then(respond).catch(() => respond({ ok: false, reason: 'not_found' }));
        return true;
      case 'SETTLE_DIFF':
        void (async () => {
          try {
            await startSettleWatch({ ignore: el => announcer.host.contains(el) });
            respond({ ok: true, diff: diffSnapshots(message.preSnapshot, takeSnapshot(document, { excludeRoot: announcer.host })) });
          } catch { respond({ ok: false, error: 'snapshot_failed' }); }
        })();
        return true;
    }
  });
  void chrome.runtime.sendMessage({ type: 'READY' }).catch(() => {});
}
