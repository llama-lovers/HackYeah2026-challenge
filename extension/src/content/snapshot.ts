import { MASK, maskText, isSensitiveField } from '../shared/mask.ts';
import { MAX_NODES, MAX_TEXT, MAX_ALERT, collapse, truncate, stripQuery } from '../shared/snapshot-format.ts';
import type { SnapNode, SnapState, Snapshot } from '../shared/snapshot-format.ts';
import type { ResolvedTarget } from '../shared/validate.ts';
import { LIVE_REGION_ID } from '../shared/protocol.ts';

let epoch = 0;
let last: Snapshot | null = null;
let idMap = new Map<string, { ref: WeakRef<Element>; node: SnapNode }>();
const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'IFRAME', 'CANVAS']);
const INTERACTIVE = new Set(['link', 'button', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'menuitem', 'tab', 'switch']);
let secretValues: string[] = [];
const safe = (s: string, max = MAX_TEXT) => {
  for (const value of secretValues) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Preserve complete parcel tokens even when a short numeric secret is a prefix.
    s = s.replace(new RegExp(/^\d+$/.test(value) ? `(?<!\\d)${escaped}(?!\\d)` : escaped, 'g'), MASK);
  }
  return truncate(maskText(s), max);
};

function parentElement(el: Element): Element | null {
  return el.parentElement ?? (el.getRootNode() instanceof ShadowRoot ? (el.getRootNode() as ShadowRoot).host : null);
}
export function isElementVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  for (let ancestor: Element | null = el; ancestor; ancestor = parentElement(ancestor)) {
    if (ancestor.hasAttribute('hidden') || ancestor.hasAttribute('inert') || ancestor.getAttribute('aria-hidden') === 'true') return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
}
export function isElementDisabled(el: Element): boolean {
  return el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true';
}
function roleOf(el: Element): string {
  const explicit = el.getAttribute('role')?.trim().split(/\s+/)[0];
  if (explicit) return explicit;
  if (el instanceof HTMLAnchorElement && el.hasAttribute('href')) return 'link';
  if (el instanceof HTMLButtonElement) return 'button';
  if (el instanceof HTMLTextAreaElement) return 'textbox';
  if (el instanceof HTMLSelectElement) return 'combobox';
  if (/^H[1-6]$/.test(el.tagName)) return 'heading';
  if (el instanceof HTMLInputElement) {
    if (['button', 'submit', 'reset', 'image'].includes(el.type)) return 'button';
    if (el.type === 'checkbox' || el.type === 'radio') return el.type;
    if (el.type === 'search') return 'searchbox';
    if (['text', 'email', 'tel', 'url', 'number', 'password'].includes(el.type)) return 'textbox';
  }
  return '';
}
// Labels may be visually hidden for accessibility; omit a nested control's text/value.
function labelText(el: Element): string {
  const parts: string[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) parts.push(child.textContent ?? '');
    else if (child instanceof Element && !['INPUT', 'TEXTAREA', 'SELECT', ...SKIP].includes(child.tagName)) parts.push(labelText(child));
  }
  return collapse(parts.join(' '));
}
function nativeLabel(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const labels = Array.from(el.labels ?? []);
    if (labels.length) return collapse(labels.map(labelText).join(' '));
  }
  if (el.id) {
    const root = el.getRootNode() as Document | ShadowRoot;
    const labels = Array.from(root.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`));
    if (labels.length) return collapse(labels.map(labelText).join(' '));
  }
  const wrapping = el.closest('label');
  return wrapping ? labelText(wrapping) : '';
}
export function computeName(el: Element): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  const labelled = (el.getAttribute('aria-labelledby') ?? '').trim().split(/\s+/).filter(Boolean)
    .map(id => { const label = root.getElementById(id); return label ? labelText(label) : ''; }).join(' ');
  if (collapse(labelled)) return collapse(labelled);
  const aria = collapse(el.getAttribute('aria-label') ?? '');
  if (aria) return aria;
  const label = nativeLabel(el);
  if (label) return label;
  if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type) && el.value) return collapse(el.value);
  const alt = el.getAttribute('alt') || el.querySelector('img[alt]')?.getAttribute('alt');
  if (alt) return collapse(alt);
  const title = collapse(el.getAttribute('title') ?? '');
  if (title) return title;
  if (['button', 'link', 'heading', 'menuitem', 'tab'].includes(roleOf(el))) {
    const text = visibleText(el);
    if (text) return text;
  }
  return collapse(el.getAttribute('placeholder') ?? '');
}
function sensitive(el: Element): boolean {
  return isSensitiveField({ tag: el.tagName, type: el.getAttribute('type') ?? '', autocomplete: el.getAttribute('autocomplete') ?? '',
    name: el.getAttribute('name') ?? '', id: el.id, label: nativeLabel(el), placeholder: el.getAttribute('placeholder') ?? '', ariaLabel: computeName(el) });
}
function visibleText(el: Element): string {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return '';
  const parts: string[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) parts.push(child.textContent ?? '');
    else if (child instanceof Element && !SKIP.has(child.tagName) && isElementVisible(child)) parts.push(visibleText(child));
  }
  return collapse(parts.join(' '));
}
function states(el: Element): SnapState {
  const state: SnapState = {};
  if (isElementDisabled(el)) state.disabled = true;
  if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)) state.checked = el.checked;
  else if (el.hasAttribute('aria-checked')) state.checked = el.getAttribute('aria-checked') === 'true';
  if (el.hasAttribute('aria-expanded')) state.expanded = el.getAttribute('aria-expanded') === 'true';
  if (el.hasAttribute('required') || el.getAttribute('aria-required') === 'true') state.required = true;
  if (el.getAttribute('aria-invalid') && el.getAttribute('aria-invalid') !== 'false') state.invalid = true;
  if (sensitive(el)) state.sensitive = true;
  return state;
}
export function takeSnapshot(doc: Document = document, opts?: { excludeRoot?: Element | null }): Snapshot {
  // Include hidden and shadow-root fields: pages can echo their values elsewhere.
  const secrets = new Set<string>();
  const collect = (root: Document | ShadowRoot) => {
    for (const el of root.querySelectorAll('*')) {
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) && sensitive(el) && el.value) secrets.add(el.value);
      if (el.shadowRoot) collect(el.shadowRoot);
    }
  };
  collect(doc);
  secretValues = [...secrets].sort((a, b) => b.length - a.length);
  const candidates: { node: SnapNode; el: Element; priority: number }[] = [];
  const walk = (el: Element) => {
    if (SKIP.has(el.tagName) || el.id === LIVE_REGION_ID || el === opts?.excludeRoot || !isElementVisible(el)) return;
    const role = roleOf(el), rect = el.getBoundingClientRect();
    const viewport = rect.bottom > 0 && rect.right > 0 && rect.top < (doc.defaultView?.innerHeight ?? 0) && rect.left < (doc.defaultView?.innerWidth ?? 0);
    let inMain = false;
    for (let p: Element | null = el; p; p = parentElement(p)) if (p.matches('main,[role="main"]')) { inMain = true; break; }
    const preferred = viewport || inMain;
    if (INTERACTIVE.has(role)) {
      const node: SnapNode = { kind: 'interactive', role, name: safe(computeName(el)), state: states(el) };
      const placeholder = safe(el.getAttribute('placeholder') ?? '');
      if (placeholder && placeholder !== node.name) node.hint = placeholder;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        if (['textbox', 'searchbox', 'combobox'].includes(role)) node.value = node.state?.sensitive ? MASK : safe(el.value);
      } else if (el instanceof HTMLSelectElement) node.value = node.state?.sensitive ? MASK : safe(Array.from(el.selectedOptions).map(o => o.textContent ?? '').join(' '));
      if (el instanceof HTMLAnchorElement) {
        const href = new URL(el.href, doc.location.href);
        node.href = safe(href.origin === doc.location.origin ? stripQuery(href.href) : href.host + stripQuery(href.href));
      }
      candidates.push({ node, el, priority: preferred ? 0 : 3 });
      return;
    }
    if (role === 'heading') {
      candidates.push({ node: { kind: 'heading', role, name: safe(visibleText(el)) }, el, priority: 1 });
      return;
    }
    if (['alert', 'status', 'log'].includes(role) || ['polite', 'assertive'].includes(el.getAttribute('aria-live') ?? '')) {
      const text = safe(visibleText(el), MAX_ALERT);
      if (text) candidates.push({ node: { kind: 'alert', role: role || 'status', name: text }, el, priority: 1 });
      return;
    }
    if (rect.width * rect.height > 1 && !['LABEL', 'LEGEND'].includes(el.tagName)) {
      const direct = Array.from(el.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent ?? '').join(' ');
      if (collapse(direct)) candidates.push({ node: { kind: 'text', role: 'text', name: safe(direct) }, el, priority: preferred ? 2 : 3 });
    }
    if (el.shadowRoot) for (const child of el.shadowRoot.children) walk(child);
    for (const child of el.children) walk(child);
  };
  if (doc.body) walk(doc.body);
  const truncated = candidates.length > MAX_NODES;
  const selected = new Set(candidates.map((c, order) => ({ ...c, order })).sort((a, b) => a.priority - b.priority || a.order - b.order).slice(0, MAX_NODES).map(c => c.order));
  const nextMap = new Map<string, { ref: WeakRef<Element>; node: SnapNode }>();
  const nodes = candidates.filter((_c, index) => selected.has(index)).map(({ node, el }) => {
    if (node.kind === 'interactive') { node.id = `e${nextMap.size + 1}`; nextMap.set(node.id, { ref: new WeakRef(el), node }); }
    return node;
  });
  const snapshot: Snapshot = { epoch: epoch + 1, path: safe(stripQuery(doc.location.pathname)), title: safe(doc.title), nodes, truncated };
  // Publish only after the full walk succeeds, so a failed walk cannot expose partial state.
  epoch = snapshot.epoch; idMap = nextMap; last = snapshot;
  return snapshot;
}
function submitsNonLookupForm(el: Element): boolean {
  if (!(el instanceof HTMLButtonElement || el instanceof HTMLInputElement) || !['submit', 'image'].includes(el.type) || !el.form) return false;
  const form = el.form;
  const method = (el.getAttribute('formmethod') ?? form.method).toLowerCase();
  return !(method === 'get' || form.getAttribute('role') === 'search' || form.classList.contains('tracking-form'));
}
export function resolveTarget(id: string, requestedEpoch: number): { target: ResolvedTarget | null; element: Element | null; node: SnapNode | null } {
  const entry = idMap.get(id), element = entry?.ref.deref() ?? null;
  if (!entry || !element) return { target: null, element: null, node: null };
  const liveState = states(element), role = roleOf(element), name = safe(computeName(element));
  const node: SnapNode = { ...entry.node, role, name, state: liveState };
  const maxLength = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.maxLength : -1;
  return { element, node, target: { exists: true, epochMatches: requestedEpoch === epoch, connected: element.isConnected,
    visible: isElementVisible(element), disabled: isElementDisabled(element), role, sensitive: !!(entry.node.state?.sensitive || liveState.sensitive), name,
    maxLength: maxLength >= 0 ? maxLength : null, submitsNonLookupForm: submitsNonLookupForm(element) } };
}
export function getLastSnapshot(): Snapshot | null { return last; }
