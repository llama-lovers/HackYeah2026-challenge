import { collapse, spokenName } from './snapshot-format.ts';
import type { Snapshot } from './snapshot-format.ts';
import { CLICK_ROLES, FILL_ROLES } from './validate.ts';
import { foldPolish } from './polish-speech.ts';
export interface ChoiceOption { id: string; name: string; role: string; context?: string }
export const MAX_OPTIONS = 3;
const normalizedName = (name: string) => collapse(name).toLocaleLowerCase('pl');
export function optionsFromIds(s: Snapshot, ids: string[], action: 'click' | 'fill'): ChoiceOption[] {
  const options: ChoiceOption[] = [], seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const n = s.nodes.find(n => n.id === id && n.kind === 'interactive');
    if (!n || n.state?.disabled || !(action === 'click' ? CLICK_ROLES : FILL_ROLES).has(n.role) || (action === 'fill' && n.state?.sensitive)) continue;
    options.push({ id, name: spokenName(n), role: n.role });
    if (options.length === MAX_OPTIONS) break;
  }
  return options;
}
export function addContexts(s: Snapshot, options: ChoiceOption[]): ChoiceOption[] {
  if (new Set(options.map(o => normalizedName(o.name))).size === options.length) return options;
  const contextual = options.map(o => {
    let heading = '';
    for (const n of s.nodes) { if (n.id === o.id) break; if (n.kind === 'heading') heading = collapse(n.name); }
    return { ...o, context: heading };
  });
  return contextual.every(o => o.context) && new Set(contextual.map(o => normalizedName(o.context))).size === options.length ? contextual : options;
}
const numbers = [
  ['jeden','jedynka','pierwszy','pierwsza','pierwsze'], ['dwa','dwojka','drugi','druga','drugie'], ['trzy','trojka','trzeci','trzecia','trzecie'],
  ['cztery','czwarty','czwarta','czwarte'], ['piec','piaty','piata','piate'], ['szesc','szosty','szosta','szoste'],
  ['siedem','siodmy','siodma','siodme'], ['osiem','osmy','osma','osme'], ['dziewiec','dziewiaty','dziewiata','dziewiate'],
];
export function parseChoice(text: string, count: number): number | 'out_of_range' | null {
  const s = collapse(foldPolish(text).replace(/[.,!?;:"'„”]/gu, ' ')).replace(/^numer\s+/u, '');
  const index = numbers.findIndex(words => words.includes(s));
  const n = /^\d+$/u.test(s) ? Number(s) : index >= 0 ? index + 1 : null;
  return n === null ? null : n >= 1 && n <= count ? n : 'out_of_range';
}
