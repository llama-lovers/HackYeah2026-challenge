export const NOISE_SELECTOR = 'iframe, ins, [id^="div-gpt-ad"]';
export const BUSY_SELECTOR = '[aria-busy="true"], .loader, [role="progressbar"]';
export function startSettleWatch({ quietMs = 800, capMs = 6000, ignore }: { quietMs?: number; capMs?: number; ignore: (el: Element) => boolean }): Promise<{ reason: 'quiet' | 'cap'; ms: number }> {
  return new Promise(resolve => {
    const start = performance.now();
    let lastMutation = start;
    const ignored = (el: Element) => !!el.closest('svg') || !!el.closest(NOISE_SELECTOR) || ignore(el);
    const observer = new MutationObserver(records => {
      if (records.some(record => {
        const el = record.target instanceof Element ? record.target : record.target.parentElement;
        return el && !ignored(el);
      })) lastMutation = performance.now();
    });
    const finish = (reason: 'quiet' | 'cap') => { observer.disconnect(); clearInterval(poll); clearTimeout(deadline); resolve({ reason, ms: performance.now() - start }); };
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'aria-hidden', 'aria-expanded', 'aria-busy', 'aria-checked', 'aria-invalid', 'value', 'open'] });
    const poll = setInterval(() => {
      const busy = Array.from(document.querySelectorAll(BUSY_SELECTOR)).some(el => !ignored(el) && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
      if (!busy && performance.now() - lastMutation >= quietMs) finish('quiet');
    }, 50);
    const deadline = setTimeout(() => finish('cap'), capMs);
  });
}
