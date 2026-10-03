# Roadmap: Polish Voice Agent for Blind Users

## Overview

The project starts with a thin but real vertical slice: push-to-talk voice on inpost.pl, transcribed through the proxy, turned by the model into a validated click or fill, with the effect announced through the user's own screen reader and sensitive data masked before anything leaves the page. The risky platform unknowns (one-time mic grant + offscreen recording, live region under NVDA, proxy round trip with strict structured output) are proven inside that slice. Phase 2 turns the slice into the demo scenario: safe, confirmed InPost parcel tracking from spoken number to quoted status. Phase 3 adds the exploration and conversation commands that let a blind user find their way around any page and never be left in silence. Phase 4 completes how the agent sounds and how it is controlled (stop, built-in voice fallback, earcons) together with a fully accessible options page and privacy preview. The demo-critical path is Phases 1 and 2. Phase 3 depends only on Phase 1, so it can run in parallel with Phase 2 when the team has spare hands.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Voice-to-Effect Vertical Slice** - Spoken Polish command on inpost.pl becomes a validated click or fill, and the real effect is announced through the screen reader, with masking and a key-holding proxy
- [ ] **Phase 2: Safe InPost Parcel Tracking** - "Sprawdź status przesyłki numer …" works end-to-end, with deterministic confirmations, refusals on secrets and questions instead of guesses
- [ ] **Phase 3: Page Exploration & Conversation** - "Co tu jest?", "co mogę zrobić?", scrolling, "powtórz", verbosity control and spoken errors so the user is never left in silence
- [ ] **Phase 4: Audio Control & Accessible Settings** - Instant stop, built-in voice fallback, earcons, silence auto-stop, and a fully accessible options page with privacy preview

## Phase Details

### Phase 1: Voice-to-Effect Vertical Slice

**Goal**: A user presses the push-to-talk shortcut on a real Polish page (inpost.pl), speaks a Polish command, and hears through their own screen reader what the agent did and what actually changed, while sensitive data stays masked and the API key never leaves the proxy.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: VOICE-01, VOICE-02, VOICE-03, OUT-01, PAGE-01, SAFE-04, ACT-01, ACT-02, ACT-04, ACT-07, PROXY-01, PROXY-02, PROXY-03
**Success Criteria** (what must be TRUE):
  1. After granting the microphone once on the extension's options page, the user presses the push-to-talk shortcut on inpost.pl, speaks, presses it again, and the Polish transcript is acted on, with no microphone prompt from the website (a stub transcriber stands in behind the same `transcribe(audio) -> text` interface if the teammate's Whisper module is not ready).
  2. Saying "wpisz [numer] w pole numeru przesyłki" fills the field (placeholder-named in the announcement), and saying "kliknij Znajdź" makes the user hear "Klikam Znajdź." followed by the actual effect read back from the page (or that nothing changed), spoken by NVDA through the live region, with consecutive messages each announced.
  3. A model proposal that names an element which does not exist, is hidden, is disabled, or has a mismatched role is never executed.
  4. In the DevTools Network tab, requests to the proxy carry only the simplified page snapshot: on a test login/payment page the password, PESEL, IBAN, card number, CVV and one-time-code values are masked, while on inpost.pl the parcel number is sent unmasked.
  5. The OpenRouter key exists only in the proxy's environment (not in the extension bundle or the repo); the proxy returns schema-valid action proposals from the pinned Claude model, rejects oversized requests, and never logs request or response bodies.

**Plans**: 4/4 plans executed
Plans:
**Wave 1**
- [x] 01-01-PLAN.md — FastAPI proxy: /api/action and /api/effect (strict schema, pinned model), /api/transcribe seam + stub, Origin/Host/body-cap guards, body-free logging, fake OpenRouter upstream (wave 1)
- [x] 01-02-PLAN.md — Extension foundation: masked snapshot + model text, fail-closed validator, turn reducer, Polish messages, DOM walker, fixtures, fixed manifest key, CDP harness (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 01-03-PLAN.md — Walking skeleton: shortcut → offscreen recording → transcribe → masked snapshot → model → validated click → "Klikam Znajdź." in the live region; options-page mic grant; WAV fallback; E2E runner (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 01-04-PLAN.md — Effect read-back (settle + diff + effect call), navigation handoff, E2E proof of refusals, privacy and logging, end-of-phase screen-reader checks (wave 3)

**UI hint**: yes
**Notes**: Research risk spikes are built inside this slice, not as a separate phase: one-time mic grant + offscreen recording (no per-site prompt), live region announcing a second message under NVDA, and a proxy round trip with strict structured output. Freeze the `transcribe` contract with the teammate first. The dev box is Linux, so live-region checks need an NVDA (Windows) or VoiceOver (macOS) machine.

### Phase 2: Safe InPost Parcel Tracking

**Goal**: As a blind user, I want to check an InPost parcel's status by voice from start to finish, so that the agent never takes an irreversible, secret-entering or ambiguous step without asking me first.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-06, ACT-05, ACT-06, INPOST-01, INPOST-02, INPOST-03, OUT-05
**Success Criteria** (what must be TRUE):
  1. On inpost.pl the user says "sprawdź status przesyłki numer …" with the number spoken as Polish words, and after the agent fills the number and runs the search, the user hears "Status na stronie: …" quoted verbatim from the page, not paraphrased by the model.
  2. Before searching, the agent reads the parsed number back in digit groups and waits for "tak"; a number that is not 8 or 24 digits is rejected with a request to repeat it, and numbers, dates and złoty amounts in the agent's own messages are spoken in natural Polish.
  3. Irreversible actions (accepting the cookie-consent banner on a clean profile, or an order/delete/submit button on a test page) are announced and executed only after a locally matched "tak", exactly as proposed, with no extra model request in the Network tab and regardless of what the model returns; the parcel search itself is not treated as irreversible.
  4. When asked to type a password, an SMS/BLIK or one-time code, or to get past a captcha, the agent stops, says why, and suggests asking a person for help.
  5. When several elements match a description, the agent asks with at most 3 numbered options instead of guessing, and no single command runs more than a small fixed number of steps before reporting and waiting.

**Plans**: 3/3 plans executed
Plans:
**Wave 1**
- [x] 02-01-PLAN.md — "Sprawdź status przesyłki numer …" end to end: Polish words to digits, digit-group readback, local "tak", fill + Znajdź, verbatim "Status na stronie: …"; recovery dialog, 25 s recording cap, natural Polish numbers (OUT-05), step budget (ACT-05)

**Wave 2** *(blocked on Wave 1 completion)*
- [x] 02-02-PLAN.md — Irreversible actions and cookie consent (Didomi) need a locally matched "tak"; the stored proposal runs exactly once with a local effect and no further model request; dialog failure paths proven

**Wave 3** *(blocked on Wave 2 completion)*
- [x] 02-03-PLAN.md — Numbered choices (strict `choose` schema + duplicate-name guard, max 3, choice -> confirmation chain) and refusals of secrets and captchas before any network call

**Notes**: Research flag: confirm with a real tracking number how InPost renders results (XHR vs reload) and how the Didomi banner behaves on a clean profile.

### Phase 3: Page Exploration & Conversation

**Goal**: The user can find their way around any page by voice and steer the conversation: hear what is on the page and what they can do, scroll, ask for a repeat, change how much the agent says, and never be left in silence.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: PAGE-02, PAGE-03, ACT-03, OUT-03, OUT-04, OUT-07, OUT-08
**Success Criteria** (what must be TRUE):
  1. Asking "co tu jest?" gives a 1–2 sentence summary of the current page, and asking "co mogę zrobić?" lists at most 3–5 available actions.
  2. The user can scroll down, up and back to the top by voice and hears the result.
  3. Saying "powtórz" replays the last message, and "krócej" / "dokładniej" moves between 3 verbosity levels that are still in effect after restarting the browser.
  4. When a command takes longer than about 8 seconds the user hears "To trwa dłużej niż zwykle", and a transcription, network or model failure, or an element that cannot be found, is spoken plainly in Polish with a suggested next step (never silence).

**Plans**: TBD
- [x] 03-01-PLAN.md
- [ ] 03-02-PLAN.md
- [ ] 03-03-PLAN.md

### Phase 4: Audio Control & Accessible Settings

**Goal**: The user decides how the agent sounds and can silence it instantly, routine states come as short earcons instead of speech, and every setting (including a privacy preview) works without mouse or sight.
**Mode:** mvp
**Depends on**: Phase 2, Phase 3
**Requirements**: OUT-02, OUT-06, SAFE-05, VOICE-04, VOICE-05, SAFE-07, A11Y-01, A11Y-02
**Success Criteria** (what must be TRUE):
  1. Pressing the stop shortcut or saying "stop" immediately silences the built-in voice, cancels any in-flight transcription or model request, and drops the pending action so nothing executes afterwards.
  2. The user can switch output to the built-in Polish voice (`chrome.tts`, pl-PL) when no screen reader is running, and the screen reader and built-in voice never speak at the same time.
  3. The user hears distinct short earcons when the mic opens and closes and for "working", "done" and "needs confirmation"; recording stops by itself after a short silence; and earcons can be turned off.
  4. With NVDA running and keyboard only, the user can operate every control on the options page (mic grant, output mode, earcons, verbosity, privacy preview), with proper labels, roles and a logical focus order, and no state is conveyed only by color, icon or animation.
  5. The privacy preview (off by default) shows exactly what would be sent to the model for the current page, with sensitive fields masked, and nothing is logged remotely.

**Plans**: TBD
**UI hint**: yes
**Notes**: Research flag: check Polish `chrome.tts` voice availability on the demo machine early. The "needs confirmation" earcon hooks into Phase 2's confirmation flow, and the options page exposes Phase 3's verbosity setting.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 (Phase 3 may start alongside Phase 2 once Phase 1 is done)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Voice-to-Effect Vertical Slice | 4/4 | In Progress|  |
| 2. Safe InPost Parcel Tracking | 3/3 | In Progress|  |
| 3. Page Exploration & Conversation | 1/3 | In Progress|  |
| 4. Audio Control & Accessible Settings | 0/TBD | Not started | - |
