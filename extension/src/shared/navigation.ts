// Browser navigation is derived only from the user's complete command, never page text.
import { browserCommandText } from './browser-command.ts';
export type NavigationCommand = { kind: 'navigate' | 'new_tab'; url: string } | { kind: 'new_tab' } | { kind: 'invalid_url' };
const OPEN = '(?:otw[oó]rz|przejd[zź]|wejd[zź]|id[zź])';
const NEW_TAB = '(?:now[aą] (?:kart[eę]|zak[lł]adk[eę]))';
const NEW_TAB_SUFFIX = /\s+w\s+nowej\s+(?:karcie|zak[lł]adce)\s*[.!]?$/iu;
const PREFIX = new RegExp(`^(?:prosz[eę]\\s+)?${OPEN}\\s+`, 'iu');
const NEW_PREFIX = new RegExp(`^${NEW_TAB}(?:\\s+(?:z(?:\\s+adresem)?|na|dla))?(?:\\s+|$)`, 'iu');

export function normalizeNavigationUrl(address: string): string | null {
  if (address.length > 2048 || /[\u0000-\u001f\u007f\\]/u.test(address)) return null;
  const value = address.trim().replace(/[.!]+$/u, '')
    .replace(/\s+kropka\s+/giu, '.').replace(/\bpe\s+el\b/giu, 'pl').replace(/\s+uko[sś]nik\s+/giu, '/')
    .replace(/\s*([.:/])\s*/gu, '$1');
  if (!value || /\s/u.test(value)) return null;
  try {
    // A supplied scheme is checked, never rewritten to turn javascript/file into HTTP.
    const explicitScheme = /^[a-z][a-z\d+.-]*:/iu.test(value) && !/^[^/:]+:\d+(?:\/|$)/u.test(value);
    const url = new URL(explicitScheme ? value : 'https://' + value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    const host = url.hostname;
    if (host !== 'localhost' && !host.includes('.') && !host.startsWith('[')) return null;
    if (!host.startsWith('[') && host !== 'localhost' && !host.split('.').every(label => /^[a-z\d](?:[a-z\d-]*[a-z\d])?$/iu.test(label))) return null;
    return url.href;
  } catch { return null; }
}

export function parseNavigationCommand(text: string): NavigationCommand | null {
  const source = browserCommandText(text).replace(/\s+prosz[eę]\s*[.!?]?$/iu, '').replace(/[.!?]+$/u, '');
  const prefix = PREFIX.exec(source);
  if (!prefix) return null;
  let address = source.slice(prefix[0].length);
  const blank = new RegExp(`^${NEW_TAB}[.!]?$`, 'iu');
  if (blank.test(address)) return { kind: 'new_tab' };
  let newTab = false;
  const newPrefix = NEW_PREFIX.exec(address);
  if (newPrefix) { newTab = true; address = address.slice(newPrefix[0].length); }
  if (NEW_TAB_SUFFIX.test(address)) { newTab = true; address = address.replace(NEW_TAB_SUFFIX, ''); }
  const explicitAddress = /^(?:(?:na|do)\s+)?(?:adres|adresem)\s*/iu.test(address);
  address = address.replace(/^(?:na|do)\s+/iu, '').replace(/^(?:stron[eęy](?:\s+internetow[aą])?|adres|adresem)\s+/iu, '');
  // Leave commands such as "otwórz menu" / "przejdź na cennik" to page actions.
  if (!newTab && !explicitAddress && !/[.:/]|\bkropka\b/iu.test(address.replace(/[.!?]+$/u, ''))) return null;
  const url = normalizeNavigationUrl(address);
  return url ? { kind: newTab ? 'new_tab' : 'navigate', url } : { kind: 'invalid_url' };
}
