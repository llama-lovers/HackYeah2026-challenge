import { LIVE_REGION_ID } from '../shared/protocol.ts';
export function createAnnouncer(doc: Document = document) {
  const host = doc.createElement('div');
  host.id = LIVE_REGION_ID;
  host.lang = 'pl';
  host.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;';
  const nodes = [doc.createElement('div'), doc.createElement('div')];
  for (const node of nodes) { node.setAttribute('role', 'status'); node.setAttribute('aria-live', 'polite'); node.setAttribute('aria-atomic', 'true'); host.append(node); }
  doc.body.append(host);
  new MutationObserver(() => { if (!host.isConnected) doc.body.append(host); }).observe(doc.body, { childList: true });
  const queue: { text: string; written: () => void }[] = [];
  let draining = false, next = 0;
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  async function drain() {
    if (draining) return;
    draining = true;
    while (queue.length) {
      for (const node of nodes) node.textContent = '';
      await sleep(60);
      const item = queue.shift()!;
      nodes[next]!.textContent = item.text;
      item.written();
      next = 1 - next;
      await sleep(300);
    }
    draining = false;
  }
  return { host, announce(text: string): Promise<void> {
    if (!text.trim()) return Promise.resolve();
    return new Promise(resolve => { queue.push({ text, written: resolve }); void drain(); });
  } };
}
