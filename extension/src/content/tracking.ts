import { collapse } from '../shared/snapshot-format.ts';
import { READ_STATUS_CAP_MS } from '../shared/limits.ts';
import type { ParcelStatus, ReadStatusResult } from '../shared/protocol.ts';
import { isElementVisible, visibleText } from './snapshot.ts';
export function detectCaptcha(doc: Document): boolean {
  const view = doc.defaultView;
  if (!view) return false;
  return Array.from(doc.querySelectorAll('.g-recaptcha, .h-captcha, .cf-turnstile, iframe[src*="recaptcha/api2/anchor"], iframe[src*="hcaptcha.com"], iframe[src*="challenges.cloudflare.com"]')).some(el => {
    const box = el.getBoundingClientRect();
    return isElementVisible(el) && box.bottom > 0 && box.right > 0 && box.top < view.innerHeight && box.left < view.innerWidth;
  });
}
export function readParcelStatus(doc: Document, digits: string): ParcelStatus | null {
  for (const wrapper of doc.querySelectorAll('.parcel-wrapper')) {
    if (wrapper.getAttribute('data-tracking') !== digits) continue;
    // Checking each result node also checks its wrapper and composed ancestors.
    const title = eligibleText(wrapper, '.parcelStatusInfo .status h2');
    const description = eligibleText(wrapper, '.parcelStatusInfo .description');
    if (title) return { kind: 'status', title, description };
    const error = eligibleText(wrapper, '.parcelStatusInfo .error p');
    if (error) return { kind: 'error', title: '', description: error };
  }
  return null;
}
function eligibleText(root: Document | Element, selector: string): string {
  for (const el of root.querySelectorAll(selector)) {
    if (!isElementVisible(el)) continue;
    // Quote the page's text without introducing spaces around inline markup.
    const text = collapse(visibleText(el, true));
    if (text) return text;
  }
  return '';
}
export async function waitForParcelStatus(doc: Document, digits: string, capMs = READ_STATUS_CAP_MS): Promise<ReadStatusResult> {
  const start = Date.now();
  do {
    const status = readParcelStatus(doc, digits);
    if (status) return { ok: true, status };
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() - start < capMs);
  const description = eligibleText(doc, '#typingErrorMsgContainer');
  if (description) return { ok: true, status: { kind: 'error', title: '', description } };
  return { ok: false, error: 'not_found', captcha: detectCaptcha(doc) };
}
