export type BrowserSearch = { query: string; newTab: boolean; addressBar: boolean } | { invalid: true };
import { browserCommandText } from './browser-command.ts';
const NEW_TAB = /\s+w\s+nowej\s+(?:karcie|zak[lł]adce)\s*[.!]?$/iu;

export function parseBrowserSearch(text: string, googlePage = false): BrowserSearch | null {
  const normalized = browserCommandText(text);
  const newTabRequest = /^otw[oó]rz\s+now[aą]\s+(?:kart[eę]|zak[lł]adk[eę])\s+i\s+/iu.exec(normalized);
  const source = newTabRequest ? browserCommandText(normalized.slice(newTabRequest[0].length)) : normalized;
  const prefix = /^(?:(?:wyszukaj|szukaj|poszukaj)(?:\s+mi)?|znajd[zź](?:\s+mi)?\s+w\s+(?:google|internecie|sieci)|chc[eę]\s+(?:wyszuka[cć]|znale[zź][cć]))(?:[,:]\s*|\s+|$)(?:prosz[eę][,:]?\s+)?(?:(?:w|na)\s+(?:google|internecie|sieci)\s+)?/iu.exec(source);
  const addressBar = /^(?:prosz[eę]\s+)?wpisz\s+(.+?)\s+(?:w\s+(?:pasek|pasku)|do\s+paska)\s+adresu\s*[.!]?$/iu.exec(source);
  const field = googlePage ? /^(?:wpisz|wprowad[zź])\s+(.+?)\s+(?:w|do)\s+(?:pol[eau]\s+)?(?:wyszukiwark[eęi]|wyszukiwania)(?:\s+google)?(?:\s+i\s+(?:wyszukaj|szukaj|naci[sś]nij\s+enter))?\s*[.!]?$/iu.exec(source) : null;
  const contextual = googlePage ? /^(?:znajd[zź]|wpisz)(?:\s+mi)?\s+(.+)$/iu.exec(source) : null;
  if (!prefix && !addressBar && !field && !contextual) return null;
  let query = field ? field[1]! : addressBar ? addressBar[1]! : prefix ? source.slice(prefix[0].length) : contextual![1]!;
  if (!field && !addressBar) query = query.replace(/^(?:w|na)\s+(?:google|internecie|sieci)(?:\s+|$)/iu, '');
  // A request to search within the current website still goes to page actions.
  if (/^na\s+(?:tej\s+)?stronie\b/iu.test(query)) {
    const googleSite = /^na\s+stronie\s+google\s+/iu;
    if (googleSite.test(query)) query = query.replace(googleSite, '');
    else if (googlePage) query = query.replace(/^na\s+(?:tej\s+)?stronie\s+/iu, '');
    else return null;
  }
  const newTab = !!newTabRequest || NEW_TAB.test(query);
  query = query.replace(NEW_TAB, '').replace(/\s+w\s+(?:google|internecie|sieci)\s*[.!]?$/iu, '').replace(/\s+prosz[eę]\s*[.!]?$/iu, '').trim();
  // Sentence punctuation from STT is not part of the search query.
  query = query.replace(/[.!]+$/u, '').trim();
  if (!query || query.length > 500 || /[\u0000-\u001f\u007f]/u.test(query)) return { invalid: true };
  return { query, newTab, addressBar: !!addressBar };
}

export function isGoogleSearchPage(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && ['google.com', 'www.google.com', 'google.pl', 'www.google.pl'].includes(url.hostname)
      && (url.pathname === '/' || url.pathname === '/webhp' || url.pathname === '/search');
  } catch { return false; }
}

export function googleSearchUrl(query: string): string {
  const url = new URL('https://www.google.com/search');
  url.searchParams.set('q', query);
  return url.href;
}

export function isBrowserStartPage(url: string | undefined): boolean {
  return url !== undefined && /^(?:(?:chrome|edge):\/\/(?:newtab|new-tab-page)\/?|chrome-search:\/\/local-ntp\/local-ntp\.html)$/u.test(url);
}
