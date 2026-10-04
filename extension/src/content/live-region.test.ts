import test from 'node:test';
import assert from 'node:assert/strict';
import { createAnnouncer } from './live-region.ts';
const doc = () => {
  const node = () => ({ textContent: '', style: {}, children: [] as any[], isConnected: true, setAttribute() {}, append(child: any) { this.children.push(child); } });
  (globalThis as any).MutationObserver = class { observe() {} };
  return { createElement: node, body: node() } as unknown as Document;
};
test('cancelled live queue resolves without writing delayed text', async () => {
  const announcer = createAnnouncer(doc());
  const delivery = announcer.announce('Delayed text', 1);
  (announcer as any).cancel?.(1);
  assert.equal(await delivery, 'cancelled');
  await new Promise(resolve => setTimeout(resolve, 80));
  assert(announcer.host.children[0]!.textContent === '' && announcer.host.children[1]!.textContent === '');
});
