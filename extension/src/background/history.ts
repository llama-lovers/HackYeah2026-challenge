import { maskText } from '../shared/mask.ts';

export interface ActionHistoryEntry {
  utterance: string;
  action: 'click' | 'fill' | 'search' | 'navigate' | 'new_tab';
  detail: string;
}
const KEY = 'actionHistory';
const actions = new Set(['click', 'fill', 'search', 'navigate', 'new_tab']);
const clean = (text: string) => Array.from(maskText(text)).slice(0, 500).join('');
let writing: Promise<void> = Promise.resolve();

export async function readActionHistory(): Promise<ActionHistoryEntry[]> {
  try {
    const value: unknown = (await chrome.storage.session.get(KEY))[KEY];
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is ActionHistoryEntry => entry !== null && typeof entry === 'object'
      && actions.has(entry.action) && typeof entry.utterance === 'string' && typeof entry.detail === 'string')
      .slice(-3).map(entry => ({ action: entry.action, utterance: clean(entry.utterance), detail: clean(entry.detail) }));
  } catch { return []; }
}

export function rememberAction(entry: ActionHistoryEntry): Promise<void> {
  const save = async () => {
    try {
      const history = await readActionHistory();
      await chrome.storage.session.set({ [KEY]: [...history, {
        action: entry.action, utterance: clean(entry.utterance), detail: clean(entry.detail),
      }].slice(-3) });
    } catch { /* History must never turn a completed action into a failure. */ }
  };
  writing = writing.then(save, save);
  return writing;
}
