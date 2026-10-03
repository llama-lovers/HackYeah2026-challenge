import type { ScrollDirection, ScrollResult } from '../shared/protocol.ts';
// About four fifths of a viewport per step keeps some of the previous text on screen, so the user does not lose their place.
export const SCROLL_VIEWPORT_FRACTION = 0.8;
export type ScrollHost = Pick<Window, 'scrollY' | 'innerHeight' | 'scrollTo' | 'document'>;
export interface Ownership { docId: string; currentDocId: () => string }
// Scrolls the top-level document immediately and reports what the page really did. Focus is never moved by the scroll itself; if a page
// script moves it anyway, the previously focused element gets it back. A page whose content lives in another scroller is "unsupported".
export function scrollDocument(direction: ScrollDirection, ownership: Ownership, host: ScrollHost = window): ScrollResult {
  if (ownership.docId !== ownership.currentDocId()) return { ok: false, reason: 'stale' };
  const doc = host.document;
  const before = Math.round(host.scrollY);
  const max = Math.max(0, Math.round((doc.scrollingElement ?? doc.documentElement).scrollHeight - host.innerHeight));
  const result = (outcome: 'moved' | 'boundary' | 'unsupported', after: number): ScrollResult => ({ ok: true, docId: ownership.docId, outcome, before, after, max });
  // No document scroll range at all: nothing here can honestly be called a movement.
  if (max < 2) return result('unsupported', before);
  const focused = doc.activeElement;
  const step = Math.max(1, Math.round(host.innerHeight * SCROLL_VIEWPORT_FRACTION));
  const top = direction === 'top' ? 0 : direction === 'down' ? Math.min(max, before + step) : Math.max(0, before - step);
  host.scrollTo({ top, behavior: 'instant' });
  if (focused && doc.activeElement !== focused && focused.isConnected && 'focus' in focused) (focused as HTMLElement).focus({ preventScroll: true });
  const after = Math.round(host.scrollY), delta = after - before;
  // Already within a pixel of the end the user is AT the end: a one-pixel nudge is not a movement worth announcing.
  const atEdge = direction === 'down' ? before >= max - 1 : before <= 0;
  if (atEdge && Math.abs(delta) <= 1) return result('boundary', after);
  if (direction === 'down' ? delta > 0 : delta < 0) return result('moved', after);
  // No movement away from the edges, or a movement the wrong way, means something other than this scroll controls the page.
  return result('unsupported', after);
}
