import { foldPolish } from './polish-speech.ts';
export type Intent = { kind: 'track_parcel'; rest: string } | { kind: 'yes' } | { kind: 'no' } | { kind: 'other' };
export function parseIntent(text: string): Intent {
  const s = foldPolish(text).replace(/[.,!?;:"'„”]/gu, ' ').replace(/\s+/gu, ' ').trim();
  if (['tak', 'tak jest', 'tak tak', 'potwierdzam', 'tak potwierdzam', 'zgadza sie'].includes(s)) return { kind: 'yes' };
  if (['nie', 'nie nie', 'anuluj', 'nie dziekuje', 'rezygnuje'].includes(s)) return { kind: 'no' };
  const m = /^(?:(?:sprawdz|sprawdzic|pokaz|sledz)(?: mi)?|jaki jest|jaki ma|status)\s+(?:status\s+)?(?:(?:mojej|tej)\s+)?(?:przesylka|przesylki|przesylke|przesylce|paczka|paczki|paczke|paczce)(?:\s+(?:o numerze|numer|nr))?(?:\s+(.*))?$/.exec(s);
  return m ? { kind: 'track_parcel', rest: m[1] ?? '' } : { kind: 'other' };
}
