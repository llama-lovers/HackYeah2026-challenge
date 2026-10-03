import type { RejectReason } from './validate.ts';
import { truncate } from './snapshot-format.ts';
export const LISTENING = 'Słucham.';
export const PROCESSING = 'Przetwarzam.';
export const BUSY = 'Jeszcze pracuję.';
export const NOTHING_HEARD = 'Nic nie usłyszałem. Spróbuj jeszcze raz.';
export const ONLY_INPOST = 'Agent działa na razie tylko na stronie InPost.';
export const RELOAD_PAGE = 'Odśwież stronę i spróbuj jeszcze raz.';
export const MIC_DENIED = 'Brak dostępu do mikrofonu. Otwieram ustawienia wtyczki.';
export const MIC_NO_DEVICE = 'Nie znalazłem mikrofonu. Podłącz mikrofon i spróbuj jeszcze raz.';
export const STT_FAILED = 'Nie udało się rozpoznać mowy. Spróbuj jeszcze raz.';
export const ASSISTANT_FAILED = 'Nie udało się połączyć z asystentem. Spróbuj jeszcze raz za chwilę.';
export const SNAPSHOT_FAILED = 'Nie mogę bezpiecznie odczytać tej strony.';
export const NONE_FALLBACK = 'Nie rozumiem polecenia. Powiedz je inaczej.';
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
};
export function rejectionText(reason: RejectReason): string { return REJECTIONS[reason]; }
export function noneSay(say: string): string { return truncate(say, 300) || NONE_FALLBACK; }
