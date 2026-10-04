import type { RejectReason, ConfirmCategory } from './validate.ts';
import { truncate, collapse } from './snapshot-format.ts';
import type { ParcelStatus, ExecutedAction, ExplorationCandidate, Verbosity, ScrollDirection, ScrollOutcome, SttErrorCode, MicErrorCode, FailureKind } from './protocol.ts';
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
// Spoken once per turn when processing is still owned at the deadline (OUT-07). A routine status, never replayed.
export const WAIT_NOTICE = 'To trwa dłużej niż zwykle';
export const NOTHING_HEARD = 'Nic nie usłyszałem. Spróbuj jeszcze raz.';
export const PAGE_UNSUPPORTED = 'Tej strony nie obsługuję. Otwórz zwykłą stronę internetową i spróbuj jeszcze raz.';
export const PAGE_ACCESS_FAILED = 'Nie mam dostępu do tej strony. Odśwież ją i spróbuj jeszcze raz.';
export const RELOAD_PAGE = 'Odśwież stronę i spróbuj jeszcze raz.';
export const MIC_DENIED = 'Brak dostępu do mikrofonu. Otwieram ustawienia wtyczki. Włącz tam mikrofon.';
export const MIC_NO_DEVICE = 'Nie znalazłem mikrofonu. Podłącz mikrofon i spróbuj jeszcze raz.';
export const OPTIONS_MIC_GRANTED = 'Mikrofon włączony. Możesz zamknąć tę kartę i nacisnąć skrót na stronie InPost.';
export const OPTIONS_MIC_BLOCKED = 'Dostęp do mikrofonu jest zablokowany. Włącz go w ustawieniach Chrome: chrome://settings/content/microphone, a potem naciśnij przycisk jeszcze raz.';
export const OPTIONS_MIC_NO_DEVICE = MIC_NO_DEVICE;
export function optionsShortcut(key: string): string { return `Skrót nagrywania: ${key}. Zmienisz go na stronie chrome://extensions/shortcuts.`; }
export const OPTIONS_SHORTCUT_MISSING = 'Skrót nagrywania nie jest ustawiony. Ustaw go na stronie chrome://extensions/shortcuts.';
export const STT_FAILED = 'Nie udało się rozpoznać mowy. Spróbuj jeszcze raz.';
export const ASSISTANT_FAILED = 'Nie udało się połączyć z asystentem. Spróbuj jeszcze raz za chwilę.';
export const SNAPSHOT_FAILED = 'Nie mogę bezpiecznie odczytać tej strony. Odśwież ją albo otwórz inną stronę.';
export const NONE_FALLBACK = 'Nie rozumiem polecenia. Powiedz je inaczej.';
export const ACTION_FAILED = 'Nie udało się wykonać tej akcji. Spróbuj jeszcze raz.';
// After an action whose effect is uncertain the user is told so and sent to a read-only check; a consequential action is never suggested for repetition.
export const EFFECT_UNKNOWN = 'Wykonałem polecenie, ale nie mogę potwierdzić, co się zmieniło na stronie. Powiedz „co tu jest”, żeby to sprawdzić.';
export const NEEDS_CONFIRMATION = 'Tej akcji nie wykonam bez potwierdzenia. Powiedz polecenie jeszcze raz.';
export function confirmPrompt(kind: 'click' | 'fill', name: string, category: ConfirmCategory, context?: string): string {
  return (kind === 'click' ? `Chcę kliknąć „${name}”` : `Chcę wpisać tekst w pole „${name}”`) + (category === 'consent' ? ' w oknie zgody na pliki cookie' : '') + (context ? ', ' + context : '') + '. Potwierdzasz? Powiedz tak albo nie.';
}
export function clickPre(name: string): string { return `Klikam ${name}.`; }
export function fillPre(name: string): string { return `Wpisuję w pole ${name}.`; }
export function noChange(kind: 'click' | 'fill', name: string): string { return `${kind === 'click' ? `Kliknąłem ${name}` : `Wpisałem tekst w pole ${name}`}, ale na stronie nic się nie zmieniło.`; }
export function effectFallback(kind: 'click' | 'fill', name: string): string { return `${kind === 'click' ? `Kliknąłem ${name}` : `Wpisałem tekst w pole ${name}`}. Strona się zmieniła, ale nie udało mi się jej opisać. Powiedz „co tu jest”, żeby ją opisać.`; }
const REJECTIONS: Record<RejectReason, string> = {
  not_found: 'Nie znalazłem tego elementu na stronie. Powiedz polecenie jeszcze raz.',
  stale: 'Nie znalazłem tego elementu na stronie. Powiedz polecenie jeszcze raz.',
  hidden: 'Ten element jest teraz niewidoczny, więc go nie użyję. Zapytaj, co tu jest, albo wybierz inny element.',
  disabled: 'Ten element jest teraz nieaktywny, więc go nie użyję. Zapytaj, co tu jest, albo wybierz inny element.',
  role_mismatch: 'Tego elementu nie da się tak użyć. Zapytaj, co możesz zrobić.',
  sensitive_fill: 'Tego pola nie wypełniam, bo jest na dane poufne. Wypełnij je samodzielnie albo poproś o pomoc zaufaną osobę.',
  empty_text: 'Nie usłyszałem, co mam wpisać. Powiedz polecenie jeszcze raz.',
  too_long: 'Ten tekst jest za długi dla tego pola. Powiedz krótszy tekst.',
  unknown_action: 'Nie umiem jeszcze tego zrobić. Zapytaj, co mogę zrobić.',
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
export const EXPLORE_FAILED = 'Nie udało się opisać tej strony. Spróbuj jeszcze raz za chwilę.';
export const PAGE_EMPTY = 'Ta strona wydaje się pusta albo jeszcze się ładuje. Poczekaj chwilę i zapytaj jeszcze raz.';
export const ACTIONS_FAILED = 'Nie udało się sprawdzić, co można tu zrobić. Spróbuj jeszcze raz za chwilę.';
export const ACTIONS_CHANGED = 'Strona zmieniła się w trakcie. Zapytaj jeszcze raz, co możesz zrobić.';
export const NO_ACTIONS = 'Na tej stronie nie widzę działań, które mogę bezpiecznie wykonać. Zapytaj, co tu jest, albo otwórz inną stronę.';
export const NO_ACTIONS_PARTIAL = 'Strona jest duża, więc mogłem nie zobaczyć wszystkiego. Na jej początku nie widzę działań, które mogę bezpiecznie wykonać. Zapytaj, co tu jest.';
const spokenLabel = (name: string) => truncate(collapse(name).replace(/[\s.!?…:;,]+$/u, ''), 60);
// Rendered from local role and name data only; model text never reaches speech for this list.
export function actionPhrase(c: ExplorationCandidate): string {
  const name = spokenLabel(c.name);
  switch (c.role) {
    case 'link': return `otworzyć link ${name}`;
    case 'button': return `kliknąć przycisk ${name}`;
    case 'menuitem': return `wybrać pozycję menu ${name}`;
    case 'tab': return `przejść do karty ${name}`;
    case 'checkbox': return `zaznaczyć lub odznaczyć ${name}`;
    case 'radio': return `wybrać opcję ${name}`;
    default: return `wpisać tekst w pole ${name}`;
  }
}
export function actionsList(items: ExplorationCandidate[], incomplete: boolean): string {
  const phrases = items.map(actionPhrase);
  const joined = phrases.length === 1 ? phrases[0]! : phrases.slice(0, -1).join(', ') + ' i ' + phrases.at(-1)!;
  return speakable((incomplete ? 'Na początku strony możesz ' : 'Możesz ') + joined + '.');
}
export const REPLAY_EMPTY = 'Nie mam nic do powtórzenia. Zapytaj na przykład, co tu jest.';
export const VERBOSITY_SPOKEN: Record<Verbosity, string> = { concise: 'Odpowiadam krótko.', standard: 'Odpowiadam standardowo.', detailed: 'Odpowiadam szczegółowo.' };
export const VERBOSITY_AT_SHORTEST = 'Już odpowiadam najkrócej. Powiedz „dokładniej”, żebym dodał szczegółów.';
export const VERBOSITY_AT_LONGEST = 'Już odpowiadam najdokładniej. Powiedz „krócej”, żebym skrócił odpowiedzi.';
export const VERBOSITY_NOT_SAVED = 'Nie udało się zapisać ustawienia, więc zostaje poprzedni poziom szczegółowości. Spróbuj jeszcze raz.';
export const SCROLL_PRE = 'Przewijam.';
export const SCROLL_FAILED = 'Nie udało się przewinąć strony. Spróbuj jeszcze raz.';
export const SCROLL_CHANGED = 'Strona zmieniła się w trakcie. Powiedz polecenie jeszcze raz.';
export const SCROLL_UNSUPPORTED = 'Nie mogę przewinąć tej strony. Jej treść może być w osobnym polu przewijania. Zapytaj, co tu jest.';
// Spoken from the page's own measurement: movement is claimed only when the position really changed.
export function scrollSpeech(direction: ScrollDirection, r: { outcome: ScrollOutcome; after: number; max: number }): string {
  if (r.outcome === 'unsupported') return SCROLL_UNSUPPORTED;
  if (r.outcome === 'boundary') return direction === 'down' ? 'Jesteś na końcu strony. Powiedz „przewiń w górę”, żeby wrócić wyżej.' : 'Jesteś na początku strony. Powiedz „przewiń w dół”, żeby czytać dalej.';
  if (direction === 'top') return 'Wróciłem na początek strony.';
  if (direction === 'down') return 'Przewinąłem w dół.' + (r.after >= r.max - 1 ? ' To koniec strony.' : '');
  return 'Przewinąłem w górę.' + (r.after <= 0 ? ' To początek strony.' : '');
}
export const ASSISTANT_TIMEOUT = 'Asystent odpowiada za wolno. Spróbuj jeszcze raz za chwilę.';
export const ASSISTANT_INVALID = 'Nie zrozumiałem odpowiedzi asystenta. Powiedz polecenie jeszcze raz.';
export const NETWORK_FAILED = 'Nie mogę połączyć się z serwerem. Sprawdź internet i spróbuj jeszcze raz.';
export const NOT_CONFIGURED = 'Usługa głosowa nie jest skonfigurowana. Poproś o pomoc osobę, która zainstalowała wtyczkę.';
export const STT_TIMEOUT = 'Rozpoznawanie mowy trwa za długo. Spróbuj jeszcze raz za chwilę.';
export const STT_INVALID = 'Usługa rozpoznawania mowy odpowiedziała błędnie. Spróbuj jeszcze raz.';
export const NOT_RECORDING = 'Nagranie nie powiodło się. Naciśnij skrót i spróbuj jeszcze raz.';
export const MIC_FAILED = 'Nie udało się uruchomić mikrofonu. Zamknij inne programy, które go używają, i spróbuj jeszcze raz.';
export const STORAGE_FAILED = 'Nie udało się zapisać stanu rozmowy. Spróbuj jeszcze raz.';
export const PIPELINE_FAILED = 'Coś poszło nie tak. Spróbuj jeszcze raz.';
export const OUTPUT_RECOVERY_TEXTS = {
  page_unsupported: PAGE_UNSUPPORTED,
  page_access: PAGE_ACCESS_FAILED,
  voice_unavailable: 'Nie ma dostępnego polskiego głosu. Używam czytnika ekranu. Wybierz głos polski w ustawieniach systemu i spróbuj jeszcze raz.',
  voice_failed: 'Głos przeglądarki nie odtworzył komunikatu. Używam czytnika ekranu. Spróbuj ponownie.',
  storage: STORAGE_FAILED,
};
export const STOP_LATENCY = 'Skrót zatrzymania działa natychmiast. Polecenie „stop” lub „zatrzymaj” działa dopiero po zakończeniu nagrania i rozpoznaniu mowy.';
export const OUTPUT_SAVED = 'Zapisano sposób odczytywania komunikatów.';
export const OUTPUT_SAVE_FAILED = 'Nie udało się zapisać ustawienia. Spróbuj jeszcze raz.';
// One fixed sentence per typed category; raw provider text, exception text, URLs and page content are never interpolated.
export const STT_FAILURES: Record<SttErrorCode, string> = { stt_failed: STT_FAILED, stt_timeout: STT_TIMEOUT, stt_invalid: STT_INVALID, not_configured: NOT_CONFIGURED, network: NETWORK_FAILED, not_recording: NOT_RECORDING };
export const MIC_FAILURES: Record<MicErrorCode, string> = { not_allowed: MIC_DENIED, no_device: MIC_NO_DEVICE, other: MIC_FAILED };
export type FailureSeam = 'assistant' | 'explore' | 'actions';
const SEAM_DEFAULT: Record<FailureSeam, string> = { assistant: ASSISTANT_FAILED, explore: EXPLORE_FAILED, actions: ACTIONS_FAILED };
export function failureText(kind: FailureKind, seam: FailureSeam): string {
  switch (kind) {
    case 'blocked': return SNAPSHOT_FAILED;
    case 'timeout': return ASSISTANT_TIMEOUT;
    case 'network': return NETWORK_FAILED;
    case 'not_configured': return NOT_CONFIGURED;
    case 'invalid_output': return seam === 'assistant' ? ASSISTANT_INVALID : SEAM_DEFAULT[seam];
    default: return SEAM_DEFAULT[seam];
  }
}
