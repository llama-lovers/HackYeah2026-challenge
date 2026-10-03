import type { RejectReason } from './validate.ts';
import { truncate } from './snapshot-format.ts';
import type { ParcelStatus } from './protocol.ts';
import { spellInteger } from './polish-speech.ts';
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
export function statusSpeech(s: ParcelStatus): string { return s.kind === 'error' ? 'Strona informuje: ' + s.description : 'Status na stronie: ' + s.title + (/[.!?…]$/u.test(s.title) ? '' : '.') + (s.description ? ' ' + s.description : ''); }
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
export const NEEDS_CONFIRMATION = 'Tej akcji nie wykonam bez potwierdzenia.';
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
  sensitive_fill: 'Tego pola nie wypełniam, bo jest na dane poufne.',
  empty_text: 'Nie usłyszałem, co mam wpisać. Powiedz polecenie jeszcze raz.',
  too_long: 'Ten tekst jest za długi dla tego pola.',
  unknown_action: 'Nie umiem jeszcze tego zrobić.',
  needs_confirmation: NEEDS_CONFIRMATION,
  irreversible: NEEDS_CONFIRMATION,
  unconfirmed: ACTION_FAILED,
};
export function rejectionText(reason: RejectReason): string { return REJECTIONS[reason]; }
export function noneSay(say: string): string { return truncate(say, 300) || NONE_FALLBACK; }
