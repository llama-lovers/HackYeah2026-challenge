import { MASK, maskText, isSensitiveField } from '../shared/mask.ts';
import { MAX_NODES, MAX_TEXT, MAX_ALERT, collapse, truncate, stripQuery } from '../shared/snapshot-format.ts';
import type { SnapNode, SnapState, Snapshot } from '../shared/snapshot-format.ts';
import type { ResolvedTarget } from '../shared/validate.ts';
import { IRREVERSIBLE_NAME_RE, SIDE_EFFECT_RE, LOOKUP_RE, BENIGN_UI_RE } from '../shared/validate.ts';
import { LIVE_REGION_ID } from '../shared/protocol.ts';

let epoch = 0;
// Identifies this document instance; requests bound to a snapshot are only valid in the document that produced it.
const documentId = crypto.randomUUID();
export function getDocumentId(): string { return documentId; }
let last: Snapshot | null = null;
let idMap = new Map<string, { ref: WeakRef<Element>; node: SnapNode; identity: string }>();
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

// Forms expose named controls as properties that shadow built-ins (DOM clobbering): every element member used by
// the walker and by policy code is therefore read through its prototype accessor, never as a property of the element.
const getter = (proto: object, name: string): ((this: unknown) => any) => Object.getOwnPropertyDescriptor(proto, name)!.get!;
const ELEMENT = Element.prototype, NODE = Node.prototype;
const tagOf = (el: Element): string => getter(ELEMENT, 'tagName').call(el);
const idOf = (el: Element): string => getter(ELEMENT, 'id').call(el);
const childrenOf = (el: Element): Element[] => Array.from(getter(ELEMENT, 'children').call(el));
const shadowOf = (el: Element): ShadowRoot | null => getter(ELEMENT, 'shadowRoot').call(el);
const connectedOf = (el: Node): boolean => getter(NODE, 'isConnected').call(el);
const parentOf = (el: Element): Element | null => getter(NODE, 'parentElement').call(el);
const childNodesOf = (el: Node): ChildNode[] => Array.from(getter(NODE, 'childNodes').call(el));
const getRoot = (el: Node): Node => NODE.getRootNode.call(el);
const getAttr = (el: Element, name: string): string | null => ELEMENT.getAttribute.call(el, name);
const attrOf = (el: Element, name: string): string => getAttr(el, name) ?? '';
const hasAttr = (el: Element, name: string): boolean => ELEMENT.hasAttribute.call(el, name);
const matchesSel = (el: Element, selector: string): boolean => ELEMENT.matches.call(el, selector);
const closestOf = (el: Element, selector: string): Element | null => ELEMENT.closest.call(el, selector);
const queryAll = (el: Element, selector: string): Element[] => Array.from(ELEMENT.querySelectorAll.call(el, selector));
const rectOf = (el: Element): DOMRect => ELEMENT.getBoundingClientRect.call(el);
const visibleCss = (el: Element): boolean => ELEMENT.checkVisibility.call(el, { checkOpacity: true, checkVisibilityCSS: true });
function parentElement(el: Element): Element | null {
  return parentOf(el) ?? (getRoot(el) instanceof ShadowRoot ? (getRoot(el) as ShadowRoot).host : null);
}
function subtreeExcluded(el: Element): boolean {
  if (!connectedOf(el)) return true;
  for (let ancestor: Element | null = el; ancestor; ancestor = parentElement(ancestor)) {
    const style = getComputedStyle(ancestor);
    if (hasAttr(ancestor, 'hidden') || hasAttr(ancestor, 'inert') || getAttr(ancestor, 'aria-hidden') === 'true' || style.display === 'none' || style.contentVisibility === 'hidden' || Number(style.opacity) === 0) return true;
  }
  return false;
}
export function isElementVisible(el: Element): boolean {
  if (subtreeExcluded(el)) return false;
  const r = rectOf(el);
  return r.width > 0 && r.height > 0 && visibleCss(el);
}
export function isElementDisabled(el: Element): boolean {
  return matchesSel(el, ':disabled') || getAttr(el, 'aria-disabled') === 'true';
}
function roleOf(el: Element): string {
  const explicit = getAttr(el, 'role')?.trim().split(/\s+/)[0];
  if (explicit) return explicit;
  if (el instanceof HTMLAnchorElement && hasAttr(el, 'href')) return 'link';
  if (el instanceof HTMLButtonElement) return 'button';
  if (el instanceof HTMLTextAreaElement) return 'textbox';
  if (el instanceof HTMLSelectElement) return 'combobox';
  if (/^H[1-6]$/.test(tagOf(el))) return 'heading';
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
  for (const child of childNodesOf(el)) {
    if (child.nodeType === Node.TEXT_NODE) parts.push(child.textContent ?? '');
    else if (child instanceof Element && !['INPUT', 'TEXTAREA', 'SELECT', ...SKIP].includes(tagOf(child))) parts.push(labelText(child));
  }
  return collapse(parts.join(' '));
}
function nativeLabel(el: Element): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    const labels = Array.from(el.labels ?? []);
    if (labels.length) return collapse(labels.map(labelText).join(' '));
  }
  if (idOf(el)) {
    const root = getRoot(el) as Document | ShadowRoot;
    const labels = Array.from(root.querySelectorAll(`label[for="${CSS.escape(idOf(el))}"]`));
    if (labels.length) return collapse(labels.map(labelText).join(' '));
  }
  const wrapping = closestOf(el, 'label');
  return wrapping ? labelText(wrapping) : '';
}
export function computeName(el: Element): string {
  const root = getRoot(el) as Document | ShadowRoot;
  const labelled = (getAttr(el, 'aria-labelledby') ?? '').trim().split(/\s+/).filter(Boolean)
    .map(id => { const label = root.getElementById(id); return label ? labelText(label) : ''; }).join(' ');
  if (collapse(labelled)) return collapse(labelled);
  const aria = collapse(getAttr(el, 'aria-label') ?? '');
  if (aria) return aria;
  const label = nativeLabel(el);
  if (label) return label;
  if (el instanceof HTMLInputElement && ['button', 'submit', 'reset'].includes(el.type) && el.value) return collapse(el.value);
  const alt = getAttr(el, 'alt') || getAttr(queryAll(el, 'img[alt]')[0] ?? el, 'alt');
  if (alt) return collapse(alt);
  const title = collapse(getAttr(el, 'title') ?? '');
  if (title) return title;
  if (['button', 'link', 'heading', 'menuitem', 'tab'].includes(roleOf(el))) {
    const text = visibleText(el);
    if (text) return text;
  }
  return collapse(getAttr(el, 'placeholder') ?? '');
}
function sensitive(el: Element): boolean {
  return isSensitiveField({ tag: tagOf(el), type: getAttr(el, 'type') ?? '', autocomplete: getAttr(el, 'autocomplete') ?? '',
    name: getAttr(el, 'name') ?? '', id: idOf(el), label: nativeLabel(el), placeholder: getAttr(el, 'placeholder') ?? '', ariaLabel: computeName(el) });
}
export function visibleText(el: Element, preserveWhitespace = false): string {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagOf(el))) return '';
  const parts: string[] = [];
  for (const child of el.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) parts.push(child.textContent ?? '');
    else if (child instanceof Element && !SKIP.has(tagOf(child)) && !subtreeExcluded(child) && getComputedStyle(child).visibility !== 'hidden') parts.push(visibleText(child, preserveWhitespace));
  }
  return preserveWhitespace ? parts.join('') : collapse(parts.join(' '));
}
function states(el: Element): SnapState {
  const state: SnapState = {};
  if (isElementDisabled(el)) state.disabled = true;
  if (el instanceof HTMLInputElement && ['checkbox', 'radio'].includes(el.type)) state.checked = el.checked;
  else if (hasAttr(el, 'aria-checked')) state.checked = getAttr(el, 'aria-checked') === 'true';
  if (hasAttr(el, 'aria-expanded')) state.expanded = getAttr(el, 'aria-expanded') === 'true';
  if (hasAttr(el, 'required') || getAttr(el, 'aria-required') === 'true') state.required = true;
  if (getAttr(el, 'aria-invalid') && getAttr(el, 'aria-invalid') !== 'false') state.invalid = true;
  if (sensitive(el)) state.sensitive = true;
  return state;
}
export function takeSnapshot(doc: Document = document, opts?: { excludeRoot?: Element | null }): Snapshot {
  // Include hidden and shadow-root fields: pages can echo their values elsewhere.
  const secrets = new Set<string>();
  const collect = (root: Document | ShadowRoot) => {
    for (const el of root.querySelectorAll('*')) {
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) && sensitive(el) && el.value) secrets.add(el.value);
      const shadow = shadowOf(el);
      if (shadow) collect(shadow);
    }
  };
  collect(doc);
  secretValues = [...secrets].sort((a, b) => b.length - a.length);
  const candidates: { node: SnapNode; el: Element; priority: number }[] = [];
  const walk = (el: Element, suppressProse = false) => {
    if (SKIP.has(tagOf(el)) || idOf(el) === LIVE_REGION_ID || el === opts?.excludeRoot || subtreeExcluded(el)) return;
    const visible = isElementVisible(el);
    const role = roleOf(el), rect = rectOf(el);
    const viewport = rect.bottom > 0 && rect.right > 0 && rect.top < (doc.defaultView?.innerHeight ?? 0) && rect.left < (doc.defaultView?.innerWidth ?? 0);
    let inMain = false;
    for (let p: Element | null = el; p; p = parentElement(p)) if (matchesSel(p, 'main,[role="main"]')) { inMain = true; break; }
    const preferred = viewport || inMain;
    if (visible && INTERACTIVE.has(role)) {
      const node: SnapNode = { kind: 'interactive', role, name: safe(computeName(el)), state: states(el) };
      const placeholder = safe(getAttr(el, 'placeholder') ?? '');
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
    if (visible && role === 'heading' && !suppressProse) {
      candidates.push({ node: { kind: 'heading', role, name: safe(visibleText(el)) }, el, priority: 1 });
      suppressProse = true;
    }
    if (visible && !suppressProse && (['alert', 'status', 'log'].includes(role) || ['polite', 'assertive'].includes(getAttr(el, 'aria-live') ?? ''))) {
      const text = safe(visibleText(el), MAX_ALERT);
      if (text) candidates.push({ node: { kind: 'alert', role: role || 'status', name: text }, el, priority: 1 });
      suppressProse = true;
    }
    if (visible && !suppressProse && rect.width * rect.height > 1 && !['LABEL', 'LEGEND', 'TEXTAREA', 'SELECT'].includes(tagOf(el))) {
      const direct = childNodesOf(el).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent ?? '').join(' ');
      if (collapse(direct)) candidates.push({ node: { kind: 'text', role: 'text', name: safe(direct) }, el, priority: preferred ? 2 : 3 });
    }
    const shadow = shadowOf(el);
    if (shadow) for (const child of shadow.children) walk(child, suppressProse);
    for (const child of childrenOf(el)) walk(child, suppressProse);
  };
  if (doc.body) walk(doc.body);
  const truncated = candidates.length > MAX_NODES;
  const selected = new Set(candidates.map((c, order) => ({ ...c, order })).sort((a, b) => a.priority - b.priority || a.order - b.order).slice(0, MAX_NODES).map(c => c.order));
  const nextMap = new Map<string, { ref: WeakRef<Element>; node: SnapNode; identity: string }>();
  const nodes = candidates.filter((_c, index) => selected.has(index)).map(({ node, el }) => {
    if (node.kind === 'interactive') { node.id = `e${nextMap.size + 1}`; nextMap.set(node.id, { ref: new WeakRef(el), node, identity: identityOf(el) }); }
    return node;
  });
  const snapshot: Snapshot = { epoch: epoch + 1, path: safe(stripQuery(doc.location.pathname)), title: safe(doc.title), nodes, truncated };
  // Publish only after the full walk succeeds, so a failed walk cannot expose partial state.
  epoch = snapshot.epoch; idMap = nextMap; last = snapshot;
  return snapshot;
}
// A form is a lookup only when positively identified by its fields and has no payment/consent/account signals;
// page-controlled hints (class, role) alone never exempt it. Every ambiguity (clobbered members, foreign form= owners,
// <base> hijacking, cross-origin or non-GET target) fails closed: anything the browser might submit differently is refused.
function isLookupForm(form: Element, submitter: Element): boolean {
  try {
    const baseURI: string = getter(NODE, 'baseURI').call(document);
    if (new URL(baseURI).origin !== location.origin) return false;
    // Only an explicit, valid "get" (or no attribute at all) is a GET; any other value is refused even where the browser would fall back to GET.
    const methods = [getAttr(submitter, 'formmethod'), getAttr(form, 'method')].filter((m): m is string => m !== null && m !== '');
    if (methods.some(m => m !== 'get' && m !== 'GET')) return false;
    // Real form membership (descendants with a foreign form= excluded, outside controls with form=<id> included), read through the prototype getter.
    const fields: Element[] = Array.from(getter(HTMLFormElement.prototype, 'elements').call(form));
    // A control or image named like a form member ("action", "id", "method", "elements"…) can shadow it; refuse rather than guess.
    if ([...fields, ...queryAll(form, 'img,embed,object')].some(field => [attrOf(field, 'name'), attrOf(field, 'id')].some(key => key !== '' && key in HTMLFormElement.prototype))) return false;
    const targets = [getAttr(submitter, 'formaction'), getAttr(form, 'action')].filter((t): t is string => t !== null && t !== '');
    for (const target of targets) if (new URL(target, baseURI).origin !== location.origin) return false;
    const signals = [...targets, attrOf(form, 'id'), attrOf(form, 'name'), attrOf(form, 'aria-label'), labelText(form),
      ...fields.filter(field => matchesSel(field, 'input')).flatMap(field => [attrOf(field, 'name'), attrOf(field, 'type') === 'hidden' ? attrOf(field, 'value') : ''])].map(safeDecode).join(' ');
    if (IRREVERSIBLE_NAME_RE.test(signals) || SIDE_EFFECT_RE.test(signals)) return false;
    const inputs = fields.filter(field => attrOf(field, 'type') !== 'hidden' && matchesSel(field, 'input,textarea,select'));
    if (inputs.some(field => sensitive(field) || matchesSel(field, '[type=checkbox],[type=radio],[type=file],[type=password]'))) return false;
    return inputs.some(field => /przesył|parcel|shipment|search|szukaj|wyszuk|track/i.test([computeName(field), attrOf(field, 'name'), idOf(field), attrOf(field, 'placeholder'), attrOf(field, 'type')].join(' ')));
  } catch { return false; }
}
// Any control inside (or submitting) a form that is not a positively identified lookup is treated as possibly irreversible.
function submitsNonLookupForm(el: Element): boolean {
  const control = el instanceof HTMLButtonElement || el instanceof HTMLInputElement ? el : null;
  const form = control?.form ?? closestOf(el, 'form');
  if (!form) return false;
  if (!isLookupForm(form, el)) return true;
  return !!control && ['submit', 'image'].includes(control.type) && !LOOKUP_RE.test(collapse(computeName(el)));
}
// Positive classification: only genuine http(s) anchors and controls named like a lookup or a harmless disclosure are known safe.
// Everything else (JS buttons, role=button divs, checkboxes, tabs with neutral names) is an uncertain side effect and is refused.
function knownSafeClick(el: Element): boolean {
  if (el instanceof HTMLAnchorElement && roleOf(el) === 'link') return /^https?:$/.test(new URL(el.href).protocol);
  const name = collapse(computeName(el));
  return LOOKUP_RE.test(name) || BENIGN_UI_RE.test(name);
}
function safeKnownSafeClick(el: Element): boolean { try { return knownSafeClick(el); } catch { return false; } }
// Payment, account-change and consent wording in any label of the control or in its destination (link path, form action).
function sideEffectSignals(el: Element): boolean {
  const texts = [computeName(el), visibleText(el), getAttr(el, 'aria-label'), getAttr(el, 'title'), getAttr(el, 'formaction')];
  if (el instanceof HTMLInputElement) texts.push(el.value);
  if (el instanceof HTMLAnchorElement) texts.push(safeDecode(el.pathname), safeDecode(el.search), safeDecode(el.hash));
  return texts.some(text => !!text && (IRREVERSIBLE_NAME_RE.test(text) || SIDE_EFFECT_RE.test(text)));
}
// Any failure while collecting signals is itself ambiguous, so it counts as a signal.
function safeSideEffectSignals(el: Element): boolean { try { return sideEffectSignals(el); } catch { return true; } }
const CONSENT_CONTAINER_SELECTOR = '#didomi-host, [id^="didomi-"], [class*="didomi-"], #onetrust-banner-sdk, #onetrust-consent-sdk, #CybotCookiebotDialog';
function consentSignal(el: Element): boolean {
  try {
    for (let ancestor: Element | null = el; ancestor; ancestor = parentElement(ancestor)) {
      if (matchesSel(ancestor, CONSENT_CONTAINER_SELECTOR)) return true;
      if (!matchesSel(ancestor, '[role="dialog"], [role="alertdialog"], dialog')) continue;
      const text = [getAttr(ancestor, 'aria-label'), computeName(ancestor), labelText(ancestor).slice(0, 300)].join(' ').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l');
      if (/cookie|ciasteczk|zgod|prywatnosc|privacy|consent/.test(text)) return true;
    }
    return false;
  } catch { return true; }
}
function safeDecode(text: string): string { try { return decodeURIComponent(text); } catch { return text; } }
// Match the snapshot's composed traversal so the heading used in numbered speech
// belongs to the same control, even when controls or rows are recycled.
function headingBefore(target: Element): string {
  let heading = '', found = false;
  const walk = (el: Element, suppressProse = false) => {
    if (found || SKIP.has(tagOf(el)) || idOf(el) === LIVE_REGION_ID || subtreeExcluded(el)) return;
    if (el === target) { found = true; return; }
    const role = roleOf(el), visible = isElementVisible(el);
    if (visible && INTERACTIVE.has(role)) return;
    if (visible && role === 'heading' && !suppressProse) { heading = visibleText(el); suppressProse = true; }
    if (shadowOf(el)) for (const child of shadowOf(el)!.children) walk(child, suppressProse);
    for (const child of childrenOf(el)) walk(child, suppressProse);
  };
  if (document.body) walk(document.body);
  return heading;
}
const recordIds = new WeakMap<Element, number>();
let nextRecordId = 0;
function recordBinding(el: Element): unknown[] {
  const records: unknown[] = [];
  for (let owner: Element | null = el; owner; owner = parentElement(owner)) {
    if (!recordIds.has(owner)) recordIds.set(owner, ++nextRecordId);
    const attributes: Attr[] = Array.from(getter(ELEMENT, 'attributes').call(owner));
    records.push([recordIds.get(owner), attributes.filter(a => a.name === 'id' || a.name.startsWith('data-')).map(a => [a.name, a.value]).sort((a,b) => a[0]!.localeCompare(b[0]!))]);
  }
  return records;
}
// Semantic identity of a snapshot target: what the model's proposal was about. Any change (role, name, purpose, destination, form
// association) means the id now denotes a different control, which must be re-proposed rather than silently reinterpreted.
function identityOf(el: Element): string {
  const control = el instanceof HTMLButtonElement || el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ? el : null;
  const form = control?.form ?? closestOf(el, 'form');
  return JSON.stringify([roleOf(el), computeName(el), tagOf(el), getAttr(el, 'type'), getAttr(el, 'name'), getAttr(el, 'placeholder'), getAttr(el, 'autocomplete'),
    el instanceof HTMLAnchorElement ? el.href : null, getAttr(el, 'formaction'), getAttr(el, 'formmethod'),
    form ? [getAttr(form, 'action'), getAttr(form, 'method'), getAttr(form, 'id')] : null, headingBefore(el), recordBinding(el)]);
}
function safeDrifted(el: Element, identity: string): boolean { try { return identityOf(el) !== identity; } catch { return true; } }
export function resolveTarget(id: string, requestedEpoch: number, expectedContext?: string): { target: ResolvedTarget | null; element: Element | null; node: SnapNode | null } {
  const entry = idMap.get(id), element = entry?.ref.deref() ?? null;
  if (!entry || !element) return { target: null, element: null, node: null };
  const liveState = states(element), role = roleOf(element), name = safe(computeName(element));
  const node: SnapNode = { ...entry.node, role, name, state: liveState };
  const maxLength = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.maxLength : -1;
  return { element, node, target: { exists: true, epochMatches: requestedEpoch === epoch, connected: connectedOf(element),
    visible: isElementVisible(element), disabled: isElementDisabled(element), role, sensitive: !!(entry.node.state?.sensitive || liveState.sensitive), name,
    maxLength: maxLength >= 0 ? maxLength : null, submitsNonLookupForm: submitsNonLookupForm(element), drifted: safeDrifted(element, entry.identity) || (!!expectedContext && safe(headingBefore(element)) !== expectedContext), sideEffectSignals: safeSideEffectSignals(element), knownSafe: safeKnownSafeClick(element), consent: consentSignal(element) } };
}
export function getLastSnapshot(): Snapshot | null { return last; }
