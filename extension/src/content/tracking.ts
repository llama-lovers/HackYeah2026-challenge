import { collapse } from '../shared/snapshot-format.ts';
import { READ_STATUS_CAP_MS } from '../shared/limits.ts';
import type { ParcelStatus, ReadStatusResult } from '../shared/protocol.ts';
export function detectCaptcha(doc: Document): boolean {
  const view = doc.defaultView;
  if (!view) return false;
  return Array.from(doc.querySelectorAll('.g-recaptcha, .h-captcha, .cf-turnstile, iframe[src*="recaptcha/api2/anchor"], iframe[src*="hcaptcha.com"], iframe[src*="challenges.cloudflare.com"]')).some(el => {
    const box = el.getBoundingClientRect();
    return el.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) && box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < view.innerHeight && box.left < view.innerWidth;
  });
}
export function readParcelStatus(doc: Document, digits: string): ParcelStatus | null {
  const wrapper = Array.from(doc.querySelectorAll('.parcel-wrapper')).find(el => el.getAttribute('data-tracking') === digits);
  if (!wrapper) return null;
  const title = collapse(wrapper.querySelector('.parcelStatusInfo .status h2')?.textContent ?? '');
  const description = collapse(wrapper.querySelector('.parcelStatusInfo .description')?.textContent ?? '');
  if (title) return { kind: 'status', title, description };
  const error = collapse(wrapper.querySelector('.parcelStatusInfo .error p')?.textContent ?? '');
  return error ? { kind: 'error', title: '', description: error } : null;
}
export async function waitForParcelStatus(doc: Document, digits: string, capMs = READ_STATUS_CAP_MS): Promise<ReadStatusResult> {
  const start = Date.now();
  do {
    const status = readParcelStatus(doc, digits);
    if (status) return { ok: true, status };
    await new Promise(resolve => setTimeout(resolve, 100));
  } while (Date.now() - start < capMs);
  const description = collapse(doc.querySelector('#typingErrorMsgContainer')?.textContent ?? '');
  if (description) return { ok: true, status: { kind: 'error', title: '', description } };
  return { ok: false, error: 'not_found', captcha: detectCaptcha(doc) };
}
