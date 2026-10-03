import type { RejectReason, ConfirmCategory } from './validate.ts';
import { truncate } from './snapshot-format.ts';
import type { ParcelStatus, ExecutedAction } from './protocol.ts';
import type { PageDiff } from './snapshot-format.ts';
import { isEmptyDiff } from './diff.ts';
import { STATUS_SPOKEN_MAX } from './limits.ts';
import { spellInteger, speakable } from './polish-speech.ts';
import type { ChoiceOption } from './choice.ts';
export const CHOICE_UNCLEAR = 'Nie jestem pewien, o który element chodzi. Powiedz polecenie dokładniej.';
export const CAPTCHA_REFUSAL = 'Nie rozwiązuję zabezpieczeń captcha. Poproś o pomoc zaufaną osobę.';
export const CAPTCHA_ON_PAGE = 'Strona pokazuje zabezpieczenie captcha. Nie rozwiązuję go. Poproś o pomoc zaufaną osobę.';
export function choicePrompt(options: ChoiceOption[]): string { return 'Pasuje kilka elementów. ' + options.map((o,i) => `${['Jeden','Dwa','Trzy'][i]}: ${o.name}${o.context ? ', ' + o.context : ''}.`).join(' ') + ' Który? Powiedz numer.'; }
export function choiceReprompt(count: number): string { return count === 2 ? 'Powiedz jeden albo dwa.' : 'Powiedz jeden, dwa albo trzy.'; }
export const STATUS_TRUNCATED_NOTE = 'Dalszy opis jest na stronie.';
export const STEP_LIMIT = 'To wszystko na jedno polecenie. Powiedz, co dalej.';
export const PARCEL_ASK_NUMBER = 'Podaj numer przesyłki.';
export const PARCEL_NO_DIGITS = 'Nie usłyszałem numeru przesyłki. Powiedz sam numer.';
export const PARCEL_NOT_UNDERSTOOD = 'Nie zrozumiałem numeru. Powiedz go cyframi, na przykład osiem siedem trzy dwa.';
export const CONFIRM_EXPIRED = 'Minął czas na odpowiedź. Powiedz polecenie jeszcze raz.';
export function parcelWrongLength(count: number): string { return count === 0 ? PARCEL_NO_DIGITS : `Liczba usłyszanych cyfr: ${spellInteger(count)}. Numer przesyłki ma osiem albo dwadzieścia cztery cyfry. Powiedz sam numer jeszcze raz.`; }
export const CANCELLED = 'Anulowałem.';
export const CONFIRM_REPROMPT = 'Powiedz tak albo nie.';
export const NOTHING_TO_CONFIRM = 'Nie ma nic do potwierdzenia.';
export const STATUS_UNREAD = 'Nie udało się odczytać statusu przesyłki ze strony. Spróbuj jeszcze raz.';
export const PARCEL_FORM_MISSING = 'Na tej stronie nie ma pola numeru przesyłki. Otwórz stronę śledzenia przesyłek InPost.';
export function parcelReadback(groups: string): string { return `Numer przesyłki: ${groups}. Potwierdzasz? Powiedz tak albo nie.`; }
export function statusSpeech(s: ParcelStatus): string {
  const prefix = s.kind === 'error' ? 'Strona informuje: ' : 'Status na stronie: ';
  const body = s.kind === 'error' ? s.description : s.title + (/[.!?…]$/u.test(s.title) ? '' : '.') + (s.description ? ' ' + s.description : '');
  if (Array.from(prefix + body).length <= STATUS_SPOKEN_MAX) return prefix + body;
  const head = s.kind === 'error' ? prefix : prefix + s.title + (/[.!?…]$/u.test(s.title) ? '' : '.') + (s.description ? ' ' : '');
  const useDescription = Array.from(head).length < STATUS_SPOKEN_MAX;
  const spokenPrefix = useDescription ? head : prefix;
  const cut = Array.from(useDescription ? s.description : body).slice(0, STATUS_SPOKEN_MAX - Array.from(spokenPrefix).length).join('');
  let boundary = -1;
  for (const m of cut.matchAll(/[.!?](?=\s)/gu)) boundary = m.index + 1;
  const lastSpace = cut.lastIndexOf(' ');
  return spokenPrefix + cut.slice(0, boundary > 0 ? boundary : lastSpace > 0 ? lastSpace : cut.length).trimEnd() + ' ' + STATUS_TRUNCATED_NOTE;
}
export const LISTENING = 'Słucham.';
export const PROCESSING = 'Przetwarzam.';
export const BUSY = 'Jeszcze pracuję.';
export const NOTHING_HEARD = 'Nic nie usłyszałem. Spróbuj jeszcze raz.';
export const ONLY_INPOST = 'Agent działa na razie tylko na stronie InPost.';
export const RELOAD_PAGE = 'Odśwież stronę i spróbuj jeszcze raz.';
export const MIC_DENIED = 'Brak dostępu do mikrofonu. Otwieram ustawienia wtyczki.';
export const MIC_NO_DEVICE = 'Nie znalazłem mikrofonu. Podłącz mikrofon i spróbuj jeszcze raz.';
export const OPTIONS_MIC_GRANTED = 'Mikrofon włączony. Możesz zamknąć tę kartę i nacisnąć skrót na stronie InPost.';
export const OPTIONS_MIC_BLOCKED = 'Dostęp do mikrofonu jest zablokowany. Włącz go w ustawieniach Chrome: chrome://settings/content/microphone, a potem naciśnij przycisk jeszcze raz.';
export const OPTIONS_MIC_NO_DEVICE = MIC_NO_DEVICE;
export function optionsShortcut(key: string): string { return `Skrót nagrywania: ${key}. Zmienisz go na stronie chrome://extensions/shortcuts.`; }
export const OPTIONS_SHORTCUT_MISSING = 'Skrót nagrywania nie jest ustawiony. Ustaw go na stronie chrome://extensions/shortcuts.';
export const STT_FAILED = 'Nie udało się rozpoznać mowy. Spróbuj jeszcze raz.';
export const ASSISTANT_FAILED = 'Nie udało się połączyć z asystentem. Spróbuj jeszcze raz za chwilę.';
export const SNAPSHOT_FAILED = 'Nie mogę bezpiecznie odczytać tej strony.';
export const NONE_FALLBACK = 'Nie rozumiem polecenia. Powiedz je inaczej.';
export const ACTION_FAILED = 'Nie udało się wykonać tej akcji. Spróbuj jeszcze raz.';
export const EFFECT_UNKNOWN = 'Wykonałem polecenie, ale nie mogę potwierdzić, co się zmieniło na stronie.';
export const NEEDS_CONFIRMATION = 'Tej akcji nie wykonam bez potwierdzenia. Powiedz polecenie jeszcze raz.';
export function confirmPrompt(kind: 'click' | 'fill', name: string, category: ConfirmCategory, context?: string): string {
  return (kind === 'click' ? `Chcę kliknąć „${name}”` : `Chcę wpisać tekst w pole „${name}”`) + (category === 'consent' ? ' w oknie zgody na pliki cookie' : '') + (context ? ', ' + context : '') + '. Potwierdzasz? Powiedz tak albo nie.';
}
export function clickPre(name: string): string { return `Klikam ${name}.`; }
export function fillPre(name: string): string { return `Wpisuję w pole ${name}.`; }
export function noChange(kind: 'click' | 'fill', name: string): string { return `${kind === 'click' ? `Kliknąłem ${name}` : `Wpisałem tekst w pole ${name}`}, ale na stronie nic się nie zmieniło.`; }
export function effectFallback(kind: 'click' | 'fill', name: string): string { return `${kind === 'click' ? `Kliknąłem ${name}` : `Wpisałem tekst w pole ${name}`}. Strona się zmieniła, ale nie udało mi się jej opisać.`; }
const REJECTIONS: Record<RejectReason, string> = {
  not_found: 'Nie znalazłem tego elementu na stronie. Powiedz polecenie jeszcze raz.',
  stale: 'Nie znalazłem tego elementu na stronie. Powiedz polecenie jeszcze raz.',
  hidden: 'Ten element jest teraz niewidoczny, więc go nie użyję.',
  disabled: 'Ten element jest teraz nieaktywny, więc go nie użyję.',
  role_mismatch: 'Tego elementu nie da się tak użyć.',
  sensitive_fill: 'Tego pola nie wypełniam, bo jest na dane poufne. Wypełnij je samodzielnie albo poproś o pomoc zaufaną osobę.',
  empty_text: 'Nie usłyszałem, co mam wpisać. Powiedz polecenie jeszcze raz.',
  too_long: 'Ten tekst jest za długi dla tego pola.',
  unknown_action: 'Nie umiem jeszcze tego zrobić.',
  needs_confirmation: NEEDS_CONFIRMATION,
  irreversible: NEEDS_CONFIRMATION,
  unconfirmed: ACTION_FAILED,
};
export function rejectionText(reason: RejectReason): string { return REJECTIONS[reason]; }
export function noneSay(say: string): string { return truncate(speakable(say), 300) || NONE_FALLBACK; }
export function localEffect(action: ExecutedAction, diff: PageDiff, category?: ConfirmCategory): string {
  if (isEmptyDiff(diff)) return noChange(action.kind, action.name);
  const prefix = action.kind === 'click' ? `Kliknąłem ${action.name}.` : `Wpisałem tekst w pole ${action.name}.`;
  if (diff.path || diff.title) return prefix + ' Jesteś teraz na stronie ' + (diff.title?.after || diff.path?.after) + '.';
  if (diff.alerts.length) return prefix + ' Strona informuje: ' + diff.alerts[0];
  if (category === 'consent' && diff.removed.length) return prefix + ' Okno zgód zostało zamknięte.';
  const text = diff.added.find(s => !/^(?:button|link|textbox|searchbox|combobox|checkbox|radio|menuitem|tab|switch)(?:\s|$)/u.test(s));
  if (text) return prefix + ' Na stronie pojawiło się: ' + text + (/[.!?…]$/u.test(text) ? '' : '.');
  return prefix + ' Strona się zmieniła.';
}
