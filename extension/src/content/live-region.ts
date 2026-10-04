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
  type Item = { text: string; generation: number; written: (result: 'delivered' | 'cancelled') => void };
  const queue: Item[] = [];
  let current: Item | undefined, cancelledThrough = -1;
  let draining = false, next = 0;
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  async function drain() {
    if (draining) return;
    draining = true;
    while (queue.length) {
      const item = current = queue.shift()!;
      for (const node of nodes) node.textContent = '';
      await sleep(60);
      if (item.generation <= cancelledThrough) { item.written('cancelled'); current = undefined; continue; }
      nodes[next]!.textContent = item.text;
      item.written('delivered'); current = undefined;
      next = 1 - next;
      await sleep(300);
    }
    draining = false;
  }
  return { host, cancel(generation: number) {
    cancelledThrough = Math.max(cancelledThrough, generation);
    for (const node of nodes) node.textContent = '';
    if (current && current.generation <= cancelledThrough) current.written('cancelled');
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i]!.generation <= cancelledThrough) queue.splice(i, 1)[0]!.written('cancelled');
  }, announce(text: string, generation = 0): Promise<'delivered' | 'cancelled'> {
    if (!text.trim() || generation <= cancelledThrough || queue.length >= 16) return Promise.resolve('cancelled');
    return new Promise(resolve => { queue.push({ text, generation, written: resolve }); void drain(); });
  } };
}
