import { foldPolish } from './polish-speech.ts';
export type Intent = { kind: 'track_parcel'; rest: string } | { kind: 'yes' | 'no' | 'other' | 'secret_request' | 'captcha_request' };
const SECRET_NOUN = '(?<![\\p{L}\\p{N}])(?:hasl\\p{L}*|password|pin|cvv|cvc|otp|blik\\p{L}*|token\\p{L}*|pesel\\p{L}*|numer\\s+karty|kod\\p{L}*\\s+(?:\\p{L}+[ -]){0,4}(?:sms\\p{L}*|blik\\p{L}*|jednorazow\\p{L}*|weryfikacyjn\\p{L}*|autoryzacyjn\\p{L}*|potwierdzajac\\p{L}*|dostepu|odbioru|pin))(?![\\p{L}\\p{N}])';
const secretNoun = new RegExp(SECRET_NOUN,'u');
const secretAssignment = new RegExp(SECRET_NOUN+'(?:\\s*:\\s*|\\s+(?:to|jest)\\s+)\\S','u');
const requestVerb = /(?<![\p{L}\p{N}])(?:wpisz|wpisac|wpiszesz|wprowadz\p{L}*|podaj|uzupelnij|wypelnij|wklej|napisz|przepisz|uzyj|zaloguj\p{L}*|ustaw\p{L}*|zmien\p{L}*)(?![\p{L}\p{N}])/u;
const questionOrNavigation = /^(?:gdzie|jak|co|czy|dlaczego|kiedy|kliknij|otworz|pokaz|przejdz)\b/u;
// Treat supplied content as private even without a known request verb. Questions
// and navigation stay routable unless they contain an assignment or data token.
function secretContent(s: string): boolean {
  if (secretAssignment.test(s)) return true;
  const labels = new RegExp(SECRET_NOUN, 'gu');
  for (const match of s.matchAll(labels)) {
    const rest = s.slice(match.index + match[0].length).trim();
    if (!rest) continue;
    if (/\d/u.test(rest)) return true;
    if (!questionOrNavigation.test(s) && /\S/u.test(rest.replace(/^(?:na|to|jest)\s+/u, ''))) return true;
  }
  return false;
}
const captchaNoun = /captch|recaptch|kapcz|nie jestem robotem|zagadk/u;
const captchaVerb = /(?<![\p{L}\p{N}])(?:rozwiaz\p{L}*|zaznacz\p{L}*|kliknij|przejdz\p{L}*|wybierz|potwierdz\p{L}*|zrob|omin\p{L}*|wpisz|wypelnij)(?![\p{L}\p{N}])/u;
export function isCaptchaLabel(name: string): boolean { return /captch|recaptch|kapcz|nie jestem robotem|not a robot/u.test(foldPolish(name)); }
export function parseIntent(text: string): Intent {
  const s = foldPolish(text).replace(/[.,!?;:"'„”]/gu, ' ').replace(/\s+/gu, ' ').trim();
  const folded = foldPolish(text);
  if (secretContent(folded) || (secretNoun.test(s) && requestVerb.test(s) && !questionOrNavigation.test(s))) return {kind:'secret_request'};
  if (captchaNoun.test(s) && captchaVerb.test(s)) return {kind:'captcha_request'};
  if (['tak', 'tak jest', 'tak tak', 'potwierdzam', 'tak potwierdzam', 'zgadza sie'].includes(s)) return { kind: 'yes' };
  if (['nie', 'nie nie', 'anuluj', 'nie dziekuje', 'rezygnuje'].includes(s)) return { kind: 'no' };
  const m = /^(?:(?:sprawdz|sprawdzic|pokaz|sledz)(?: mi)?|jaki jest|jaki ma|status)\s+(?:status\s+)?(?:(?:mojej|tej)\s+)?(?:przesylka|przesylki|przesylke|przesylce|paczka|paczki|paczke|paczce)(?:\s+(?:o numerze|numer|nr))?(?:\s+(.*))?$/.exec(s);
  return m ? { kind: 'track_parcel', rest: m[1] ?? '' } : { kind: 'other' };
}
