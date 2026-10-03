# Phase 2: Safe InPost Parcel Tracking - Research

**Researched:** 2026-10-03
**Domain:** Chrome MV3 voice agent, deterministic safety layer (confirmations, refusals, disambiguation) and the InPost tracking scenario on inpost.pl
**Confidence:** HIGH for the live InPost behaviour and the Phase 1 hook points (both observed or read this session). MEDIUM for Polish speech-to-text behaviour on spoken numbers and for NVDA behaviour (neither can be observed on this Linux box).

<user_constraints>
## User Constraints

No `02-CONTEXT.md` exists. The user chose to continue without `/gsd-discuss-phase`, so there are no Phase 2 locked decisions, discretion areas or deferred ideas to copy. Nothing in this document is a locked user decision.

Binding inputs that act as constraints (same authority as locked decisions):
- `/home/bartos/HackYeah2026-challenge/CLAUDE.md` and `/home/bartos/HackYeah2026-challenge/.claude/CLAUDE.md` (see Project Constraints below).
- Phase 1 decisions D-01..D-25 in `01-CONTEXT.md` that Phase 2 builds on and must not break: D-04 and D-23 (spoken element name is the placeholder if present, else the accessible name, taken from the DOM and never from the model's `say`), D-05 (navigation handoff), D-09 (one command at a time, "Jeszcze pracuję."), D-11 (frozen `/api/transcribe` contract), D-19 (proxy owns prompt and schema), D-20 (no body logging), D-24 (Phase 1 fails closed on irreversible actions; **Phase 2 explicitly replaces this with the "tak" flow**, see `SKELETON.md` "Subsequent Slice Plan").
- `REQUIREMENTS.md` Out of Scope: no `navigate(url)` tool for the model, no autonomous multi-step agent loops (one bounded action per command), no login/banking flows in the demo, no Demo Plan B.

Everything below the line "Claude's discretion" is research recommendation, not a decision.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAFE-01 | Irreversible actions need spoken "tak"; deterministic policy in the extension; model can only add confirmations | Section "Confirmation flow". `validateProposal` already has the policy floor (`validate.ts:29-30`); Phase 2 turns its two reject reasons into a confirmable verdict and adds a session-stored pending record |
| SAFE-02 | Confirmed action executes exactly as proposed; "tak" matched locally, never re-planned | Pending record stores the exact `Proposal` + `epoch` + `docId`; the "tak" turn intercepts before `SNAPSHOT` and before `/api/action`; no new snapshot (ids would renumber) |
| SAFE-03 | Never type passwords / SMS / BLIK / OTP, never do captcha; stop, say why, suggest a human | Two deterministic layers: utterance intent filter (before the model) and target-level `sensitive_fill` (exists); plus captcha detector. New fixed Polish refusal strings |
| SAFE-06 | Cookie-consent banners (Didomi) are legal consent and need "tak" | Verified live: Didomi buttons are plain light-DOM `button`s inside `#didomi-host`, currently refused only because `knownSafe=false`. Needs explicit consent classification in the content script |
| ACT-05 | Bounded steps per command, then report and wait | Constant `MAX_STEPS_PER_COMMAND` + a step budget enforced in the one shared execution helper |
| ACT-06 | Ambiguity -> ask with at most 3 numbered options | Deterministic duplicate-name guard + new flat `choose` action in the proxy schema + local numeric reply matching |
| INPOST-01 | "sprawdź status przesyłki numer ..." fills the number, runs the search, reads the status | Local intent + local skill state machine (no model call); live behaviour verified |
| INPOST-02 | Polish words -> digits, 8 or 24 digits, read back in groups, "tak" before searching | Verified parser algorithm (prototype run), readback format, pending state `confirm_parcel` |
| INPOST-03 | Status quoted from the DOM, not paraphrased | Verified result DOM (`.parcelStatusInfo .status h2` + `.description`); the Phase 1 snapshot truncates to 120 chars so a dedicated extractor is required |
| OUT-05 | Numbers, dates, PLN amounts spoken in natural Polish | New pure module `polish-speech`; applied to agent-authored and model-authored text, never to the verbatim page quote |
</phase_requirements>

## Summary

Phase 1 delivered a single-shot pipeline: `utterance -> SNAPSHOT -> /api/action -> one EXECUTE -> diff -> /api/effect -> announce` (`pipeline.ts:125-166`). Phase 2 needs three things that pipeline cannot do today: (1) **multi-turn state** (a pending question that the next push-to-talk utterance answers), (2) **a confirmable verdict** instead of the hard reject on irreversible actions, and (3) a **deterministic local skill** for the InPost scenario. All three fit the existing architecture without new dependencies: the pending state goes in `chrome.storage.session` under a new key next to `turn` and `pendingEffect`; the verdict change is a small edit in `validateProposal`; the skill reuses `EXECUTE` through one extracted helper.

The live InPost research resolved the roadmap's research flag. On a clean profile with a normal browser user agent the Didomi notice **does** appear (a modal `role=dialog aria-modal=true` with three buttons), but it does **not** block the tracking form (nothing is `inert` or `aria-hidden`), and the parcel search is an **in-page XHR** (`history.pushState` + `GET /shipx-proxy/?number=...`, response in about 0.5 s, **no reload**). The result is rendered into a stable structure whose title and description can be quoted verbatim. Two facts shape the design: the Phase 1 snapshot truncates text nodes to 120 characters and the diff to 160, so INPOST-03 needs a dedicated full-text extractor in the content script, and a headless Chromium with the default user agent gets **no banner at all**, so the banner can only be tested live with a spoofed user agent and must otherwise be tested with a fixture.

**Primary recommendation:** Build the InPost scenario as a local, model-free state machine (intent parse -> number parse -> readback -> "tak" -> fill -> click "Znajdź" -> local DOM quote), generalise the same pending-record mechanism for irreversible-action confirmations and numbered choices, and put all Polish number/date/amount speech in one pure, unit-tested module that is applied everywhere except the verbatim page quote.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Intent matching for "sprawdź status przesyłki", "tak"/"nie", numeric choice, secret/captcha requests | Service worker (pure module in `shared/`) | — | Must run before any snapshot or model call; pure functions are `node --test`-able |
| Polish words -> digits, digit grouping, number/date/PLN speech | `shared/` pure module | Service worker applies it in `announce` | No DOM; used by both SW messages and tests |
| Pending interaction record (confirm / choose / await number / confirm parcel) | Service worker via `chrome.storage.session` | — | SW is killed when idle, so state cannot live in globals (project rule); content scripts must not read session storage (already disabled in Phase 1) |
| Irreversible / consent / captcha / sensitive classification | Content script | `shared/validate.ts` (policy decision) | Only the content script sees the live DOM and Didomi container; policy stays deterministic and outside the model |
| Executing the confirmed action | Content script (`execute`) | SW triggers it with the stored proposal | Re-validates live signals (epoch, drift, visibility) so a changed page fails closed |
| Reading the parcel status verbatim | Content script (new `tracking.ts`) | SW announces it | Needs full-text DOM access; the text never has to leave the browser |
| Numbered option generation | Content script / SW from the snapshot | Proxy schema (`choose`) for semantic ambiguity | Names spoken must come from the DOM, not from the model (D-04) |
| Step budget | Service worker (single execution helper) | — | The SW orchestrates every EXECUTE |
| System prompt, schema (`choose`), refusal wording for the model path | Proxy (D-19) | — | Locked: proxy owns prompt and schema |

## Standard Stack

### Core

No new runtime or dev dependencies. [ASSUMED] that this is the right call for Polish number words (no library evaluated); see "Don't Hand-Roll".

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 7.0.2 | Extension code | Already pinned in `extension/package.json` [VERIFIED: extension/package.json] |
| esbuild | 0.28.2 | Bundler | Already pinned [VERIFIED: extension/package.json] |
| `node --test` | Node 26.8.2 | Pure-logic unit tests on `.ts` files | Existing pattern: 103 tests pass today [VERIFIED: `npm test` run this session] |
| FastAPI + httpx + pydantic | `fastapi>=0.142.2`, `httpx>=0.28.1` | Proxy schema extension (`choose`) | Already in `server/pyproject.toml` [VERIFIED: server/pyproject.toml] |
| pytest | `>=9.1.1` | Proxy tests | 63 pass today [VERIFIED: `uv run pytest` run this session] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-written Polish number-word parser/speller | An npm Polish number-to-words package | Not evaluated this session, and the project rule is "no dependency without a reason". The inverse direction (words -> digits, tolerant of ASR output) is needed and is rarely provided by such packages [ASSUMED] |
| Local model-free tracking skill | Send "sprawdź status przesyłki numer ..." to `/api/action` | The model would have to emit two actions per command (fill then click) and cannot quote the status; slower and a demo risk on poor internet. Rejected |
| `?number=` deep link (the site auto-searches `getParam('number')` on load) | In-page fill + click | Verified the site supports it, but it is a `navigate(url)`, which `REQUIREMENTS.md` puts out of scope (prompt-injection path). Do not use |

**Installation:** none.

## Package Legitimacy Audit

Phase 2 installs no external packages. Audit not applicable. No `[SLOP]` or `[SUS]` entries. **Packages removed due to [SLOP] verdict:** none. **Packages flagged as suspicious [SUS]:** none.

## Live InPost Findings (resolves the roadmap research flag)

Method: headless Chromium 152.0.7977.82 driven over CDP with the repo's own `extension/e2e/cdp.mjs`, clean throw-away profile, `--lang=pl-PL`, against the real `https://inpost.pl/sledzenie-przesylek` on 2026-10-03; plus a read of the site's own tracking JavaScript (`/sites/default/files/js/js_LhMDizal2_22bnwYdUwkX6ftM2T7UFPLBgwP3G_Q3sE.js`, `Drupal.behaviors.trackParcels`). The built Phase 1 extension (`dist-e2e`) was loaded in one run to see what Phase 1 actually does on the real page.

### Confirmed

| Finding | Evidence |
|---------|----------|
| **Search is an in-page XHR, not a reload.** Submit runs `history.pushState` to `?number=<n>`, then `GET /shipx-proxy/?number=<n>&new_api=true&language=pl_PL`. CDP showed `Page.navigatedWithinDocument` and no new document navigation. Result in the DOM about 541 ms after the click | [VERIFIED: CDP probe, `Network.requestWillBeSent` + `Page.navigatedWithinDocument`; site JS `findParcel`, `getRandomEndpoint`] |
| **The navigation-handoff job (D-05) is not needed for the tracking click**, the page stays the same document, so the same content script and `docId` keep working | [VERIFIED: same probe] |
| **Success DOM** (observed for number `000000000000000000000001`, which the real API answers with a real status, "Anulowano etykietę"): `<div class="parcel-wrapper" data-tracking="<number>">` > `.parcel-section` > `.parcelStatusInfo` > `<div class="status"><h2>TITLE</h2></div>` + `<div class="description">DESCRIPTION</div>` + `<div class="textnumber">Przesyłka nr:</div>` + `<div class="number copyNumber" role="button" tabindex="0" aria-label="Skopiuj numer przesyłki">` | [VERIFIED: CDP `outerHTML` dump; site JS `singleStatusInfo`] |
| **Error DOM** (404): `.parcelStatusInfo > <div class="error"><p class="paragraph--component -small"><img alt="error icon">MESSAGE</p></div>`. Verbatim Polish message for unknown 24-digit and 8-digit numbers: `Ups... Nie znaleźliśmy paczki o podanym numerze. Spróbuj go wpisać ponownie.` | [VERIFIED: CDP probe, numbers `999999999999999999999999` and `12345678`, both `404` from `/shipx-proxy/`] |
| **Site-side validation**: regex `^(\d{8}|\d{24})$`. A 7-digit or non-numeric value makes **no request** and writes `Pamiętaj: każdy numer śledzenia musi mieć 24 cyfry. Możesz śledzić do 5 paczek jednocześnie.` into `#typingErrorMsgContainer` (`aria-live="polite"`) | [VERIFIED: CDP probe `1234567`, `abcdefgh`; site JS `numberMatchRule`] |
| **Duplicate search is a no-op**: `processNumbers` returns early when the number was already searched in this page session, and a click then changes nothing | [VERIFIED: site JS `processNumbers`, `hasChanged`] — so the status reader must read the **existing** `[data-tracking="<n>"]` wrapper rather than rely on a diff |
| **Loader**: `.loader` is inserted before the result and removed in `successCallback`/`errorCallback`; Phase 1's `BUSY_SELECTOR` already contains `.loader` | [VERIFIED: site JS `findParcel`/`successCallback`; `settle.ts:2`] |
| **The site has its own live regions** that can speak at the same time as ours: `#typingErrorMsgContainer`, `.copyFeedback`, and a `blend` region ("Loading page, please wait...") | [VERIFIED: CDP probe, `[aria-live]` enumeration] |
| **Didomi on a clean profile, normal user agent**: `Didomi.shouldConsentBeCollected() === true`, notice visible, `body.didomi-popup-open`. Container `#didomi-host` (light DOM, not shadow). Dialog: `role="dialog" aria-modal="true" aria-label="Witamy na undefined Zarządzanie zgodami"` (sic, the label contains the literal word "undefined"). Three buttons, ids and **literal uppercase text content**: `didomi-notice-disagree-button` "ODRZUĆ WSZYSTKO", `didomi-notice-learn-more-button` "DOSTOSUJ", `didomi-notice-agree-button` "ZAAKCEPTUJ WSZYSTKO", plus a "Polityce cookies" link | [VERIFIED: CDP probe, spoofed UA] |
| **The banner does not block the page**: no `inert`, no `aria-hidden` on siblings, input and "Znajdź" work with the banner open. So the tracking flow does **not** depend on handling Didomi | [VERIFIED: CDP probe (`inertOthers: 0`, search ran with banner open)] |
| **Clicking "ZAAKCEPTUJ WSZYSTKO"**: no navigation, dialog gone within 300 ms, `#didomi-host` becomes `aria-hidden="true"`, consent purposes enabled become `analityczn-…`, `marketing-…`, `niezbedne-…` | [VERIFIED: CDP probe] |
| **Chromium's accessibility tree still exposes a live region placed in `<body>` outside the open `aria-modal` dialog** (`ignored: false`), so Phase 1's live region is not hidden by the banner in Chromium | [VERIFIED: `Accessibility.getFullAXTree`, Chromium 152, probe element `role=status`]. NVDA's own behaviour with the modal is **not** verified (see Not confirmed) |
| **Phase 1 on the real page**: snapshot has 65-70 nodes (`truncated=false`), banner buttons appear as `e2/e3/e4`, "Znajdź" is `button e30` and passes the policy (`knownSafe=true`, `submitsNonLookupForm=false`, `{ok:true, kind:click}`); after a search the snapshot gains `heading "Anulowano etykietę"`, `text "Etykieta nadawcza ..."` and `button "Skopiuj numer przesyłki"` | [VERIFIED: extension loaded in Chromium, `SNAPSHOT` message from the SW; `validateProposal` run on live nodes] |
| **Today all three Didomi buttons are refused as `irreversible` only because `knownSafe=false`**. `SIDE_EFFECT_RE`/`IRREVERSIBLE_NAME_RE` do **not** match "ZAAKCEPTUJ WSZYSTKO" (the boundary lookbehind rejects the prefix "Za" of "Zaakceptuj"). So consent detection must be explicit, not regex luck | [VERIFIED: live `validateProposal` run; `validate.ts:8,13`] |

### Not confirmed (state this honestly in the plan)

| Gap | Why | How to close |
|-----|-----|--------------|
| A **real, in-transit** parcel and long multi-event descriptions (HTML in `eventDescription`, links, dates) | No real tracking number available. `000000000000000000000001` returns a real "Anulowano etykietę" status, which proves the success path, but not description length or markup variety | Human check with a real number from the team; the extractor must use `textContent` and be unbounded in length (cap only the spoken length, see Pitfall 3) |
| Behaviour of **NVDA** with the open Didomi `aria-modal` dialog and with the site's own live regions colliding with ours | Linux box, no screen reader | Add to the existing WINDOWS human checks (clean profile, banner open, say "sprawdź status…") |
| **Why** a default headless user agent shows no banner: with the default `HeadlessChrome` UA the SDK reported `shouldConsentBeCollected=false` and auto-enabled all purposes; with a normal Chrome UA string the notice appeared. Two variables changed between the runs (UA string and navigation timing), so "bot detection" is an inference | Probes `probe`, `probe2` | Treat headless runs as "no banner" and use a fixture (below); do not claim the mechanism |
| Banner behaviour depends on the visitor's region (the Didomi loader URL carries country/region) | The tests ran from one network location | Rehearse once on the demo machine's network with a clean profile |
| `Didomi` notice markup can change at any time (third-party CMP) | — | Detect by container (`#didomi-host`, `[id^="didomi-"]`) **and** by role=dialog plus cookie wording, not by button id alone |

## Architecture Patterns

### System Architecture Diagram

```
Alt+Shift+A (toggle)  -> offscreen records -> /api/transcribe -> TRANSCRIPT(text)         [Phase 1, unchanged]
                                                                   |
                                                                   v
                                          SW runCommand(turnId, tabId, text)
                                                                   |
        +----------------------------------------------------------+------------------------------------+
        | 1. read pending interaction from chrome.storage.session (expired / other doc -> drop)           |
        |    pending exists?                                                                              |
        |      yes -> routeReply(pending, text):                                                          |
        |             "tak"          -> run STORED proposal (no SNAPSHOT, no /api/*)                      |
        |             "nie"/anuluj   -> clear, "Anulowałem."                                              |
        |             1|2|3|jeden..  -> build proposal for chosen option, go to step 4                     |
        |             number words   -> (await_parcel_number) go to step 3                                |
        |             anything else  -> re-ask once, then cancel                                          |
        |      no  -> 2.                                                                                  |
        +-------------------------------------------------------------------------------------------------+
                                                                   |
        2. local intent filter (pure, before any network):                                                |
             secret / captcha request  -> SAY refusal ("nie wpisuję…, poproś osobę")   [END]             |
             "sprawdź status przesyłki numer …" -> 3.                                                     |
             else -> SNAPSHOT -> duplicate-name guard -> /api/action (model) -> 4.                        |
                                                                   |
        3. parcel skill: wordsToDigits -> 8|24 digits?                                                    |
             no  -> SAY "Usłyszałem N cyfr … powtórz numer"; pending=await_parcel_number                  |
             yes -> SAY readback in digit groups + "Powiedz tak"; pending=confirm_parcel(digits)          |
             ("tak" later) -> SNAPSHOT -> EXECUTE fill -> SNAPSHOT -> EXECUTE click "Znajdź"              |
                              -> READ_STATUS (content, polls [data-tracking=n], verbatim)                 |
                              -> SAY "Status na stronie: <title>. <description>"            [END]        |
                                                                   |
        4. performProposal(proposal, {confirmed, budget})   (single shared helper, extracted from       |
           pipeline.ts:143-165)                                                                          |
             -> content EXECUTE -> validateProposal (hard rejects always; confirm-class only if          |
                confirmed===true)                                                                         |
                hard reject         -> SAY rejection text                                                 |
                confirm-class       -> store pending=confirm_action(exact proposal, epoch, docId, name)  |
                                       SAY "Chcę kliknąć „X”. Powiedz tak, żeby potwierdzić." [END]       |
                ok                  -> pre-line, click/fill, settle, diff -> effect text                  |
```

Model-chosen ambiguity (`choose`) and the duplicate-name guard both end in `pending=choose_option(options<=3)`; the reply is turned into a normal proposal and re-enters at step 4.

### Where Phase 2 hooks into Phase 1 (read this session)

| Phase 1 location | Verbatim anchor | Phase 2 change |
|------------------|-----------------|----------------|
| `extension/src/background/pipeline.ts:125-166` `runCommand` | `export async function runCommand(turnId: string, tabId: number \| undefined, rawText: string)` | Insert pending-reply routing and the local intent filter **before** `chrome.tabs.sendMessage(tabId, { type: 'SNAPSHOT' }...)` (line 133). Extract lines 143-165 (job creation, `EXECUTE`, rejection/none/effect handling) into `performProposal(...)` and reuse it from the model path, the confirmed path, the choice path and the parcel skill |
| `pipeline.ts:36-42` `announce` | `export async function announce(tabId, text)` | Apply `speakable()` (OUT-05) to agent-authored/model-authored text here or at each message builder; add an options argument so the status quote is spoken **verbatim** |
| `pipeline.ts:43-52` `announceEffect` | `postJson<EffectResponse>('/api/effect'...` | Confirmed and skill steps need a **deterministic local effect text** (no model call), see Pitfall 6 |
| `pipeline.ts:168-177` `handleExecuting` | requires `job.state === 'proposed'` and `turn.phase === 'processing'` | Every EXECUTE, including skill steps, still needs a `proposed` job record, so the extracted helper must always create it |
| `protocol.ts:5` | `export const SESSION_KEYS = { turn: 'turn', pendingEffect: 'pendingEffect' } as const;` | Add `pending: 'pending'` |
| `protocol.ts:7` | `export type ToContent = { type: 'PING' } \| { type: 'SNAPSHOT' } \| { type: 'EXECUTE'; epoch: number; proposal: Proposal; turnId: string; jobId: string; docId: string } \| { type: 'ANNOUNCE'; text: string } \| { type: 'SETTLE_DIFF'; preSnapshot: Snapshot };` | Add `confirmed?: boolean` to `EXECUTE`; add `{ type: 'READ_STATUS'; number: string }` and a captcha/consent probe if needed |
| `protocol.ts:9` | `export type ExecuteResult = { ok: true; kind: 'click' \| 'fill'; name: string; role: string; diff?: PageDiff } \| { ok: true; kind: 'none' } \| { ok: false; reason: RejectReason };` | Extend the reject variant with `name`, `role` and a `category` (`consent` / `irreversible` / `model_flag`) so the SW can speak and store a confirmation |
| `extension/src/shared/validate.ts:3` | `export type RejectReason = 'unknown_action' \| 'not_found' \| 'stale' \| 'hidden' \| 'disabled' \| 'role_mismatch' \| 'sensitive_fill' \| 'empty_text' \| 'too_long' \| 'needs_confirmation' \| 'irreversible' \| 'unconfirmed';` | Keep as is. `needs_confirmation` and `irreversible` become the **only confirmable** reasons; all others are hard rejects |
| `validate.ts:29-30` | `if (p.needs_confirmation) return reject('needs_confirmation');` and the `irreversible` line | Skip exactly these two checks when `confirmed === true` (new third parameter). Order: all hard checks first, drift check last stays |
| `extension/src/content/executor.ts:9-22` `execute` | `export async function execute(epoch, proposal, announcer, commit)` | Add `{ confirmed }`; on a confirm-class verdict return the reject variant enriched with `name`/`role`/`category` instead of executing. Keep the 300 ms pre-line delay and all revalidations (lines 18-39) untouched |
| `extension/src/content/snapshot.ts:272-281` `resolveTarget` | returns `ResolvedTarget` | Add a `consent: boolean` signal (ancestor `#didomi-host` / `[id^="didomi-"]` / cookie dialog) |
| `extension/src/shared/messages.pl.ts` | `REJECTIONS`, `NEEDS_CONFIRMATION` | New strings below; `sensitive_fill` text must gain the "ask a person" suggestion |
| `extension/src/content/index.ts:11-36` message switch | `case 'SNAPSHOT'`... | New cases `READ_STATUS` (and, optionally, `PROBE_PAGE` for captcha) |
| `server/app/schemas.py:7-18` `ACTION_SCHEMA` | `"action": {"type": "string", "enum": ["click", "fill", "none"]},` | Add `"choose"` and flat `option_1..option_3` string fields (all `required`, `additionalProperties: false`); mirror in `ActionProposal` |
| `server/app/prompts.py:3-23` | system prompt text | Add `choose` semantics; remove "return none with one short Polish question" |
| `server/tests/fake_openrouter.py` | deterministic fake | Teach it `choose`; keep `needs_confirmation=False` always so tests prove the extension, not the model, enforces confirmation |
| `server/fixtures/tracking-form.html` | fixture | Align result markup with the real DOM (see Fixtures) |

### Recommended Project Structure (additions only)

```
extension/src/
├── shared/
│   ├── polish-speech.ts        # wordsToDigits, digitsToSpokenGroups, spellInteger, formatPln, formatDate, speakable
│   ├── intent.ts               # parseIntent(): track_parcel | yes | no | choice(n) | secret_request | captcha_request | other
│   ├── pending.ts              # PendingInteraction types + pure routeReply(pending, text, now)
│   ├── limits.ts               # MAX_STEPS_PER_COMMAND, MAX_OPTIONS = 3, CONFIRM_TTL_MS
│   └── *.test.ts
├── content/
│   └── tracking.ts             # readParcelStatus(doc, digits), detectCaptcha(doc)
server/fixtures/                # tracking-form.html (updated), consent-banner.html, ambiguous.html, captcha.html
extension/e2e/scenarios/        # confirm.mjs, tracking.mjs, secrets.mjs, choice.mjs
```

### Pattern 1: Pending interaction record in `chrome.storage.session`

**What:** One record, one key (`SESSION_KEYS.pending`), a discriminated union. Written by `runSerial` tasks only (same rule as `turn`), read at the top of `runCommand`, expired by TTL, dropped on tab removal and on `docId` mismatch.

```typescript
// Source: design for this phase; shape follows the existing PendingEffectJob in protocol.ts:34
export type PendingInteraction = { id: string; tabId: number; docId: string; createdAt: number } & (
  | { kind: 'confirm_action'; proposal: Proposal; epoch: number; name: string; role: string; category: 'consent' | 'irreversible' | 'model_flag' }
  | { kind: 'choose_option'; action: 'click' | 'fill'; text: string; epoch: number; options: { id: string; name: string; role: string }[] }  // length <= 3
  | { kind: 'await_parcel_number' }
  | { kind: 'confirm_parcel'; digits: string }
);
```

Reply routing is a **pure function** `routeReply(pending, rawText, now)` returning `'confirm' | 'cancel' | 'choose:<n>' | 'number:<digits>' | 'reprompt' | 'expired'`, so every branch is a unit test.

### Pattern 2: One execution helper (`performProposal`)

Extract `pipeline.ts:143-165` so that the model path, confirmed path, choice path and parcel skill share the job record, the `EXECUTING` handshake, the step budget and the rejection mapping. Parameters: `proposal`, `epoch`, `docId`, `{ confirmed?: boolean; effect: 'model' | 'local' | 'none' }`, and a shared `StepBudget`. This is the single place where "no more than N steps" and "confirmed flag only comes from a stored pending record" are enforced.

### Pattern 3: Confirmed execution never re-snapshots

On "tak" the SW sends `EXECUTE` with the **stored** `epoch`, `docId` and `proposal`. It must not call `SNAPSHOT` first: `takeSnapshot` increments `epoch` and renumbers ids (`snapshot.ts:207-209`), which would make the stored id point at a different element or fail `epochMatches`. The existing checks then do exactly what is wanted: `epochMatches`, `connected`, `visible`, `disabled`, role, and `drifted` (identity of the control) fail closed if the page changed during the pause, and the user hears the existing "Nie znalazłem tego elementu na stronie. Powiedz polecenie jeszcze raz."

### Pattern 4: Parcel skill as local state machine

```
"sprawdź status przesyłki numer <words>"  --parseIntent--> track_parcel(rest)
 rest -> wordsToDigits -> {digits}
   len ∉ {8,24}  -> pending=await_parcel_number; say "Usłyszałem {n} cyfr. Numer ma mieć 8 albo 24 cyfry. Powiedz numer jeszcze raz."
   len ∈ {8,24}  -> pending=confirm_parcel(digits); say "Numer przesyłki: {groups}. Powiedz tak, żeby wyszukać."
 "tak" -> SNAPSHOT; pick textbox (placeholder/name /przesył|parcel/); EXECUTE fill(digits)
       -> SNAPSHOT; pick button "Znajdź" in the same form; EXECUTE click
       -> READ_STATUS(digits) (poll up to the settle cap)
       -> say "Status na stronie: {title}. {description}"   (verbatim)
```

The fill and the click each go through the unchanged content-script validation. The parcel search is **not** confirmable (the `LOOKUP_RE` + lookup-form policy already marks "Znajdź" safe, verified live). The step count for the skill is 2 EXECUTE steps (fill, click) plus one local read, within `MAX_STEPS_PER_COMMAND = 3`.

### Anti-Patterns to Avoid

- **Re-sending "tak" to the model, or taking a fresh snapshot before executing a confirmed action.** Breaks SAFE-02 and renumbers ids.
- **Letting the model's `needs_confirmation:false` or its `say` text influence whether/what is executed or spoken** (D-04, D-24 logic). Confirmation text is built from DOM names only.
- **Matching "tak" with a contains/regex-anywhere test.** The screen reader's own prompt ("…powiedz tak…") can be picked up by the microphone; match the **whole normalised utterance** only.
- **Reading the status out of the snapshot or the diff.** Truncated to 120/160 characters and goes through the model path. Use the dedicated extractor.
- **Normalising the page quote.** The OUT-05 number rewriting must skip the verbatim "Status na stronie:" quote, otherwise INPOST-03 is violated.
- **Treating only the three known Didomi button ids as consent.** The CMP is third-party markup.
- **Calling `/api/effect` after a confirmed action** if criterion 3 ("no extra model request") is read literally. See Pitfall 6.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Element accessible-name / form-lookup classification | A second classifier for consent or captcha | Extend `snapshot.ts` (`resolveTarget`, `isLookupForm`) with one more signal | The Phase 1 code already survived 12 review findings (DOM clobbering, drift, base-href); re-implementing loses those hardenings |
| Confirmation of irreversible actions via the model | Asking the model "is the user confirming?" | Pure `routeReply` + stored proposal | SAFE-02 forbids it and a model round trip is slower and non-deterministic |
| Executing the confirmed click | A new click path | The existing `execute()` with `confirmed:true` | Keeps the epoch/drift/visibility revalidation and the `EXECUTING` handshake |
| Waiting for the search result | Fixed `sleep` | `startSettleWatch` + poll for `[data-tracking="<n>"]` | Result arrives in about 0.5 s but the loader and SVG churn exist; reuse settle |
| Strict output schema enforcement | Parsing free JSON | Existing strict `response_format` + pydantic `ActionProposal` | Already in place; extend both together |
| Polish speech of digits/dates/złoty (words) | Ad-hoc string concatenation in message builders | One tested module (`polish-speech.ts`) | Plural and ordinal rules are error-prone (see below). Hand-rolling **is** justified here (see Alternatives), but only once, in one file |

**Key insight:** every safety decision in this phase is a pure function over data the extension already holds (transcript text, snapshot node, stored proposal). Keep them pure, put them in `shared/`, and test them with `node --test`; the DOM and the model only supply inputs.

## Polish speech: parsing and speaking (INPOST-02, OUT-05)

### Words -> digits (prototype run and verified on these inputs)

A greedy chunker over diacritic-stripped, lower-cased tokens. Numeric tokens are appended as-is (Whisper often already returns digits). Each spoken chunk contributes digits by shape:

- hundreds present (`sto`, `dwieście` ... `dziewięćset`): zero-padded to 3 digits ("sto pięć" -> `105`);
- teens / tens (`dziesięć` ... `dziewięćdziesiąt`, optionally followed by a unit): 2 digits ("dwadzieścia trzy" -> `23`, "dwadzieścia" -> `20`);
- a lone unit (`zero` ... `dziewięć`): 1 digit ("zero pięć" -> `0`,`5` -> `05`);
- any other word -> fail, so the agent asks to repeat instead of guessing.

```javascript
// Source: prototype executed this session (scratchpad pl.mjs); all outputs below were observed
const strip = s => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').toLowerCase();
// UNITS/TEENS/TENS/HUND are the usual nominative tables (zero..dziewięć, dziesięć..dziewiętnaście, dwadzieścia..dziewięćdziesiąt, sto..dziewięćset)
// Observed: all four of these gave 873234987612340872938732 (24 digits):
//   digit-by-digit words | hundreds-chunk words (osiemset siedemdziesiąt trzy ...) | "873 234 987 ..." | "8732 3498 7612 ..."
// Also observed: "osiem siedem trzy dwa" -> "8732"; "dwanaście trzydzieści cztery pięćdziesiąt sześć siedemdziesiąt osiem" -> "12345678";
//   "sto pięć" -> "105"; "zero pięć" -> "05"; an unknown word ("x") or "dwa tysiące" -> failure.
```

Numbers over a thousand are deliberately unsupported (a parcel number is never dictated as "tysiące"); they fail and trigger "powtórz".

### Digits -> speech

- **Parcel readback:** group digits (24 -> six groups of 4; 8 -> two groups of 4) and speak **each digit as a word**, groups separated by commas, e.g. "osiem siedem trzy dwa, trzy cztery dziewięć osiem, ..." Reason: a numeral such as `8732` is read by a Polish TTS as a cardinal ("osiem tysięcy siedemset ..."), which is useless for verifying an identifier, and a 24-digit string can be read as one gigantic number. [ASSUMED: NVDA's Polish voice behaviour; the words form is engine-independent, which is why it is recommended]
- **PLN amounts:** `349 zł`, `349,00 zł`, `12,50 PLN`, `1 299 zł` -> words with declension. Rule (standard Polish): 1 -> "złoty"; 2-4 except 12-14 (last two digits) -> "złote"; everything else -> "złotych"; grosze: "grosz" / "grosze" / "groszy" by the same rule; thousands "tysiąc" / "tysiące" / "tysięcy"; millions "milion" / "miliony" / "milionów". [CITED: standard Polish numeral agreement, general knowledge; no source fetched, covered by tests the executor writes]
- **Dates:** `04.10.2026`, `2026-10-04`, `4 października 2026` -> genitive ordinals ("czwartego października dwa tysiące dwudziestego szóstego roku"). Needs ordinal tables 1-31 and year ordinals; keep to these three formats.
- **Free-standing integers** in prose: leave as digits (the screen reader's Polish voice reads them as cardinals). Only identifiers, amounts and dates are rewritten. [ASSUMED]

**Where applied:** every agent-authored message builder and every model-authored string (`noneSay`, effect text) goes through `speakable()`. **Not applied** to the verbatim quote (`Status na stronie: …`) and not to element names read from the page. Success criterion 2 says "numbers, dates and złoty amounts in the agent's own messages", which is consistent with this carve-out. Put the carve-out into an explicit unit test (quote substring equals the DOM text).

## Common Pitfalls

### Pitfall 1: The 15 s recording cap can cut a dictated 24-digit number
**What goes wrong:** `offscreen.ts` auto-stops at 15 s (`setTimeout(() => stop(c), 15000)`, lines 83 and 95, from D-07). "sprawdź status przesyłki numer" plus 24 digit words is roughly 12-16 s of speech [ASSUMED estimate: about 0.5 s per spoken digit plus 2-3 s preamble]. The tail of the number is lost, the digit count is wrong, the agent asks to repeat, and the demo loops.
**How to avoid:** support the two-step dialog (utterance without number -> `await_parcel_number`; the next utterance may be only the number) and raise the cap for this phase (e.g. 25-30 s) or make it a named constant. Because the number is read back and confirmed, truncation is caught, but it must not become the normal path.
**Warning signs:** the readback count is 21-23 digits; Whisper returns the number cut mid-word.

### Pitfall 2: The "tak" prompt is picked up by the microphone
**What goes wrong:** the screen reader speaks "…Powiedz tak, żeby wyszukać." If the user presses push-to-talk before it finishes, or without a headset, the recording contains the prompt and the transcript contains "tak".
**How to avoid:** whole-utterance match only (`^tak$` after trimming punctuation/case), never "contains". End prompts so the last spoken word is not "tak" (e.g. "Potwierdzasz? Powiedz tak albo nie."). Add a headset line to the human check (already in the Phase 1 checks).

### Pitfall 3: Verbatim status is long, truncated, or contains markup
**What goes wrong:** the description is `innerHTML` set by the site and can contain links and long text. The snapshot caps text at `MAX_TEXT = 120` and `MAX_ALERT = 160` (`snapshot-format.ts:9`), the diff caps strings at 160 (`diff.ts:3`).
**How to avoid:** the extractor uses `textContent`, collapses whitespace, does **not** truncate the stored text, and the SW speaks it fully. Verbosity control ("krócej", "dokładniej") is Phase 3, so in Phase 2 either speak the quote in full or, above a length threshold (suggest 400 characters, [ASSUMED], planner decides), cut at a sentence boundary and say that the text was shortened. Do not run the quote through the model.

### Pitfall 4: Status text can contain digits that `maskText` would mangle
**What goes wrong:** `safe()` in `snapshot.ts` applies `maskText` (PESEL/Luhn/NRB checksum on digit runs). A phone number or reference in a description could be replaced by `[ukryte]`, so the "verbatim" quote would not be verbatim.
**How to avoid:** the quote never leaves the browser, so the extractor must read raw `textContent` from the content script **without** `safe()` and the SW must not forward it to `/api/*`. Add an e2e assertion that the status quote is not present in any upstream request body.

### Pitfall 5: The Didomi banner and "headless" runs
**What goes wrong:** a default headless Chromium shows **no** banner, so an e2e that "tests Didomi" passes vacuously.
**How to avoid:** test banner behaviour against a **fixture** that copies the verified structure (`#didomi-host` > `role=dialog aria-modal=true` > three buttons with the exact ids and uppercase labels), and keep one live rehearsal in the human checks with a non-headless profile.

### Pitfall 6: "No extra model request" vs the Phase 1 effect call
**What goes wrong:** after a confirmed click, Phase 1's `announceEffect` calls `/api/effect` (a second model request) when the diff is non-empty. Roadmap criterion 3 says "no extra model request in the Network tab".
**How to avoid:** on the confirmed path and in the parcel skill use a **deterministic local effect text** (e.g. banner closed -> "Okno zgód zostało zamknięte."; alerts quoted verbatim; title/path change -> "Jesteś teraz na stronie {title}."; else the existing `effectFallback`). Even then the "tak" turn still produces one `/api/transcribe` request (speech to text, a Whisper model call) — **surface this to the user** as an Open Question: the criterion can only mean "no chat/planning request".

### Pitfall 7: Stale ids after any action
**What goes wrong:** the content script's `execute` ends with `takeSnapshot`, bumping `epoch` and renumbering ids. The second step of the parcel skill (click "Znajdź") cannot reuse ids from before the fill.
**How to avoid:** `SNAPSHOT` between skill steps (local, free) and pick elements again by role/name/placeholder, not by remembered id.

### Pitfall 8: Confirmation outliving its context
**What goes wrong:** the page navigates, the tab changes, or minutes pass, and a later "tak" executes against something else.
**How to avoid:** store `tabId`, `docId` and `createdAt`; drop on `chrome.tabs.onRemoved` (extend `handleTabRemoved`), on `docId` mismatch, and after a TTL (suggest 60 s, a named constant). Never persist the pending record for a hard-rejected action.

### Pitfall 9: Existing tests encode the Phase 1 refusal behaviour
**What goes wrong:** these assert the fail-closed wording and will fail by design: `extension/src/shared/messages.pl.test.ts` ("every rejection is spoken and unsafe actions require confirmation" expects `Tej akcji nie wykonam bez potwierdzenia.` for both reasons), `extension/src/shared/validate.test.ts` (`rejects irreversible name …` expects `{ ok:false, reason:'irreversible' }` without `confirmed`, which stays true when `confirmed` defaults to false), and `extension/e2e/scenarios/refusals.mjs` (expects `Tej akcji nie wykonam bez potwierdzenia.` for "kliknij Zapłać" and `Tego pola nie wypełniam, bo jest na dane poufne.` for the password field).
**How to avoid:** update them deliberately in the plan that changes the behaviour (the unconfirmed path still must not click; the wording changes to the confirmation prompt). Keep the "model always returns `needs_confirmation=false`" fake so the tests prove the extension enforces it.

### Pitfall 10: Site-owned live regions speak over ours
**What goes wrong:** `#typingErrorMsgContainer` and `.copyFeedback` are `aria-live="polite"` and may speak at the same time as our region. Not observable on Linux.
**How to avoid:** the only agent action that touches them is the fill/search; keep our messages short and sequential (the FIFO queue already exists) and check this in the NVDA run.

## Confirmation flow (SAFE-01, SAFE-02, SAFE-06) in detail

1. **Classification (content script, deterministic).** A click is *confirm-class* when any of: model `needs_confirmation`; `IRREVERSIBLE_NAME_RE` / `SIDE_EFFECT_RE`; `submitsNonLookupForm`; `sideEffectSignals`; `!knownSafe`; **new** `consent` (target inside `#didomi-host`, any `[id^="didomi-"]`/`[class*="didomi-"]` ancestor, or a `role=dialog` ancestor whose text matches cookie/zgod/prywatno). These are exactly today's two `RejectReason`s, now confirmable. Everything else in `RejectReason` stays a hard reject and is never offered for confirmation (hidden, disabled, role mismatch, stale, sensitive fill, empty/too long text, unknown action).
2. **Prompt (SW, built from DOM data only).** "Chcę kliknąć „{name}”. Potwierdzasz? Powiedz tak albo nie." For consent add the context: "To zgoda w oknie plików cookie." The name is `spokenName` (placeholder-else-name, D-23), uppercase labels are spoken as-is.
3. **Reply.** Next PTT turn. `tak` (whole utterance, case/punctuation-insensitive; a small synonym set such as "tak jest", "potwierdzam" is a discretionary addition) -> execute stored proposal with `confirmed:true`; `nie`/`anuluj`/`stop` -> clear + "Anulowałem."; anything else -> one re-prompt ("Powiedz tak albo nie."), second miss -> cancel silently with "Anulowałem." so a stale confirmation never survives.
4. **Execution** goes through `execute(..., { confirmed: true })`: all hard checks and the drift check still run; the existing `clickPre` announcement plays, then click, settle, diff, local effect text.
5. **Network invariant to test:** between the prompt and the executed click, upstream recorder shows **zero** `action_proposal` and zero `effect_summary` requests (fake upstream `--record` file, as `refusals.mjs` already does with `upstreamMark/upstreamSince`).

The model can never remove a confirmation: `needs_confirmation:false` from the model changes nothing because the policy is computed from the live DOM; `confirmed:true` can only originate in the SW, which sets it only from a stored pending record that matched a local "tak" in the same tab and document (`sender.id` is already verified in the content script, `index.ts:12`).

## Refusals: secrets and captcha (SAFE-03)

- **Layer A, utterance filter (before any network call).** A pure `parseIntent` classifies a transcript as a request to enter a secret or defeat a captcha. Triggers (suggested, `[ASSUMED]` list, extend in tests): `hasł|haslo|password|kod sms|kod blik|blik|kod jednorazow|jednorazowy|kod weryfikacyjn|pin|cvv|cvc|pesel|numer karty|captcha|recaptcha|nie jestem robotem|zagadk|obrazki`. Needs an action verb or request shape ("wpisz", "podaj", "wprowadź", "uzupełnij", "rozwiąż", "przejdź", "kliknij nie jestem robotem") to avoid refusing a read-only question. On match: speak the refusal, no snapshot, no model call.
- **Layer B, target level (exists).** `validateProposal` rejects any fill of a `sensitive` field (`sensitive_fill`), detected from `type=password`, `autocomplete` tokens, name/id/label/placeholder regex (`mask.ts:48-49`). Gap to close: `SENSITIVE_FIELD_RE` does not include words such as "kod weryfikacyjny", "kod autoryzacyjny", "token", "kod odbioru"; extend it and its tests (`mask.test.ts`).
- **Layer C, captcha on the page.** The snapshot skips `IFRAME` (`snapshot.ts:14`), so a reCAPTCHA/Turnstile widget is invisible to the model and cannot be clicked, but the agent should still say why it stops. Add `detectCaptcha(document)` to the content script: `iframe[src*="recaptcha"|"hcaptcha"|"challenges.cloudflare.com"]`, `.g-recaptcha`, `.h-captcha`, `.cf-turnstile`, `[data-sitekey]`. Use it in the tracking skill after the click (if the result never appears and a captcha is present, say so) and when a click target is named like a captcha checkbox. [ASSUMED: InPost showed no captcha on the tracking page in the probes; the newsletter form has reCAPTCHA per Phase 1 research, which is outside the demo path]
- **Wording** (suggested, executor finalises; keep to CLAUDE.md section 4: short, plain, reason + next step): `Nie wpisuję haseł ani kodów SMS i BLIK, bo to Twoje poufne dane. Poproś o pomoc zaufaną osobę.` and `Nie rozwiązuję captcha. Poproś o pomoc inną osobę.` The existing `sensitive_fill` message ("Tego pola nie wypełniam, bo jest na dane poufne.") must gain the same suggestion.

## Ambiguity and numbered choices (ACT-06) and step bound (ACT-05)

**Today:** the system prompt tells the model to "return none with one short Polish question naming at most three options" and the extension speaks `say` (`noneSay`). That is unenforceable ("at most 3", numbered) and the user's reply has nowhere to go.

**Recommended (two layers):**
1. **Deterministic duplicate guard (mandatory).** After the proposal returns and before `EXECUTE`, the SW looks at the snapshot it already holds: other interactive nodes with the same role and the same case-folded, whitespace-collapsed name that are not disabled. If any exist, do not execute; build up to 3 options (the proposed target plus others in DOM order) and ask. This is testable offline: the fake upstream picks the **first** name match, so a fixture with two identical buttons proves the guard, not the model. Real-page examples seen live: "Logo InPost, Przejdź do strony głównej" (e10, e38), "Pobierz z Google Play" (two).
2. **Model `choose` (for semantic ambiguity).** Extend the strict schema with action `choose` and three flat string fields `option_1`, `option_2`, `option_3` (ids, empty string if unused). Flat because Anthropic's structured output rejects array constraints beyond `minItems` 0/1 (`maxItems` is therefore unavailable) and the repo keeps schemas flat. [CITED: platform.claude.com/docs/en/build-with-claude/structured-outputs — "Array constraints beyond minItems of 0 or 1" are not supported; limits: 24 optional params, 16 union params, 20 strict tools]. Three extra required string fields stay far below those limits. The extension validates each id against the snapshot, dedupes, caps at 3 (`MAX_OPTIONS`), and builds the spoken list from DOM names.
3. **Spoken form:** "Pasuje kilka elementów. Jeden: {name}. Dwa: {name}. Powiedz numer." Reply matcher accepts `1|2|3`, `jeden|dwa|trzy`, `pierwszy|drugi|trzeci`, `numer jeden` and so on; anything else cancels. A chosen option becomes a normal proposal and re-enters `performProposal`, so a chosen irreversible control still goes through confirmation.
4. **Step bound.** `MAX_STEPS_PER_COMMAND = 3` (suggested) in `limits.ts`, a `StepBudget` object created in `runCommand` and decremented in `performProposal` for every `EXECUTE`. The parcel skill uses 2. When exhausted: report what was done and wait ("To wszystko na jedno polecenie. Powiedz, co dalej."). Unit-test the budget and e2e-test that no path loops.

## Fixtures and test infrastructure (Linux box)

Phase 1 harness: CDP + real extension in Chromium + real proxy + deterministic fake upstream (`server/tests/fake_openrouter.py`), scenarios in `extension/e2e/scenarios/*.mjs` (`ctx.speak(page, stubText)`, `waitForLive`, `upstreamMark/upstreamSince`). Baseline this session: 103 unit tests, typecheck clean, 63 server tests all pass; e2e was not rerun (long, needs Chromium + uv; both available).

| Fixture (served at `/fixtures/`) | Purpose | Notes |
|-----|-----|-----|
| `tracking-form.html` (update) | Result markup identical to the real site | Replace the `<p>Status: ...</p>` result with `.parcel-wrapper[data-tracking]` > `.parcelStatusInfo` > `.status h2` + `.description`, and the error as `.error p`; keep the loader and the SVG churn. The real site answers `000…001` with a real status, so the fixture's `startsWith('0000')` error special case does not mirror reality; use a dedicated "not found" number. Update `dom-check.mjs`/`tracer.mjs`/`effect.mjs` expectations that mention `Status: W drodze do paczkomatu` |
| `consent-banner.html` (new) | SAFE-06 | `#didomi-host` > `div[role=dialog][aria-modal=true]` with the three buttons (`didomi-notice-agree-button` etc., literal uppercase text); clicking agree removes the dialog and sets `aria-hidden` on the host; also a `window.__consent` flag so a test can assert it was **not** set before "tak" |
| `ambiguous.html` (new) | ACT-06 | Two enabled buttons with the same name ("Usuń") plus two distinct ones for the model-`choose` path |
| `captcha.html` (new) | SAFE-03 layer C | A `.g-recaptcha` element and an iframe stub |
| `sensitive.html` (existing) | Zapłać confirmation, password refusal | Already has `window.__paid`; the form `submit` handler sets it, so "click executed only after tak" is directly assertable |

Scenarios to add (each uses `ctx.speak` twice for the confirm flows): `confirm` (prompt, then "tak" executes exactly once, `window.__paid === true`, zero chat requests between), `confirm-no` (nie/other leaves `__paid` unset), `tracking` (words -> readback in groups -> "tak" -> fill -> click -> live log contains `Status na stronie: ` + the fixture's exact title and description; upstream recorder shows no `/api/effect` and the status text is absent from every upstream body), `secrets` (password/BLIK/captcha utterances: refusal text, zero upstream requests), `choice` (duplicate buttons -> options -> "dwa" -> second button clicked), `budget`. The e2e `ctx.speak` stub path works for any stub text, so no microphone is needed.

## Code Examples

### Confirmable verdict (smallest change to the existing policy)

```typescript
// Source: extension/src/shared/validate.ts:14-33 (read this session); only the new parameter is added
export function validateProposal(p: Proposal, t: ResolvedTarget | null, opts: { confirmed?: boolean } = {}): Verdict {
  // ... all hard checks unchanged ...
  if (!opts.confirmed && p.needs_confirmation) return reject('needs_confirmation');
  if (!opts.confirmed && p.action === 'click' && (IRREVERSIBLE_NAME_RE.test(t.name) || SIDE_EFFECT_RE.test(t.name) || t.submitsNonLookupForm || t.sideEffectSignals || t.consent || !t.knownSafe)) return reject('irreversible');
  if (t.drifted) return reject('stale');   // still last, still applied when confirmed
  return { ok: true, kind: p.action as 'click' | 'fill' };
}
```

### Status extractor (content script)

```typescript
// Source: selectors verified live (see "Live InPost Findings"); textContent so nothing is truncated or masked
export function readParcelStatus(doc: Document, digits: string): { kind: 'status' | 'error'; title: string; description: string } | null {
  const wrapper = Array.from(doc.querySelectorAll('.parcel-wrapper')).find(el => el.getAttribute('data-tracking') === digits);
  if (!wrapper) return null;                                   // not rendered yet: caller polls until the settle cap
  const title = wrapper.querySelector('.parcelStatusInfo .status h2')?.textContent?.replace(/\s+/g, ' ').trim();
  const description = wrapper.querySelector('.parcelStatusInfo .description')?.textContent?.replace(/\s+/g, ' ').trim();
  if (title) return { kind: 'status', title, description: description ?? '' };
  const error = wrapper.querySelector('.parcelStatusInfo .error p')?.textContent?.replace(/\s+/g, ' ').trim();
  return error ? { kind: 'error', title: '', description: error } : null;
}
// Fallback if the structure changes: say the visible text of the wrapper verbatim, never a model paraphrase.
```

Spoken: status -> `Status na stronie: ${title}. ${description}`; error -> `Strona informuje: ${description}` (the "Status na stronie" prefix is misleading for "Nie znaleźliśmy paczki"; planner decision).

### Strict schema extension (proxy)

```python
# Source: server/app/schemas.py:7-18 (read this session) extended; flat fields because maxItems is unsupported by the structured-output grammar
ACTION_SCHEMA = {"type": "object", "properties": {
    "action": {"type": "string", "enum": ["click", "fill", "choose", "none"]},
    "target": {"type": "string"}, "text": {"type": "string"},
    "option_1": {"type": "string"}, "option_2": {"type": "string"}, "option_3": {"type": "string"},
    "needs_confirmation": {"type": "boolean"}, "say": {"type": "string"}},
  "required": ["action", "target", "text", "option_1", "option_2", "option_3", "needs_confirmation", "say"],
  "additionalProperties": False}
```

Changing the schema changes the grammar-compile warm-up and the Phase 1 live verification (WINDOWS entry 1 is still open); freeze it early, update `warm_up` and `fake_openrouter.py`.

## State of the Art

| Old approach (Phase 1) | Phase 2 approach | Impact |
|------------------------|------------------|--------|
| Irreversible click -> hard refusal "Tej akcji nie wykonam bez potwierdzenia." | Confirm-class verdict + pending record + local "tak" | The user can actually complete a consent/order action by voice |
| Model decides what to say on ambiguity | Extension builds numbered options from DOM names | Verifiable "at most 3", no model-authored element names |
| Effect always via `/api/effect` | Local deterministic effect on confirmed and skill paths; status quoted from the DOM | INPOST-03 and the literal "no extra model request" reading |

**Deprecated within this repo by this phase:** D-24's fail-closed rule (replaced, not removed: the *unconfirmed* path still never acts).

## Runtime State Inventory

Not a rename/refactor/migration phase. Omitted. The one persistence change is a new in-memory `chrome.storage.session` key (`pending`), cleared on browser restart; no data migration.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | extension build/tests | ✓ | 26.8.2 | — |
| Chromium | e2e harness, live probes | ✓ | 152.0.7977.82 | — |
| uv + Python | proxy tests | ✓ | uv 0.12.20, Python 3.14.8 | — |
| Network to inpost.pl | live checks | ✓ | HTTP 200 observed | — |
| OpenRouter key (live model) | live `choose` schema verification | not checked (the secret-read guard blocked reading `server/.env`, by design) | — | e2e uses the fake upstream; WINDOWS entry 1 stays open |
| NVDA / VoiceOver | live-region and banner speech | ✗ (Linux dev box) | — | Human check on a Windows/macOS machine |
| Real InPost tracking number | real status text | ✗ | — | `000000000000000000000001` returns a real "Anulowano etykietę" status; human check with a real number |

**Missing with no fallback:** none blocking the automated work.
**Missing with fallback:** NVDA, real number, live key (human checks).

## Security Domain

`security_enforcement: true`, ASVS level 1, block on high (`.planning/config.json`).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | The extension never types credentials (SAFE-03) |
| V3 Session Management | partial | Pending interaction bound to `tabId` + `docId` + TTL in `chrome.storage.session`; not readable by content scripts |
| V4 Access Control | yes | Deterministic policy in the extension; `confirmed` only from SW after a stored pending record; hard rejects never confirmable |
| V5 Input Validation | yes | Strict pydantic schema for new `choose`/`option_*` fields; local validation of ids against the snapshot; digit-count validation of the parcel number; cap of 3 options |
| V6 Cryptography | no | No new crypto |
| V7 Logging | yes | Proxy still logs no bodies (D-20); the status quote must not reach the proxy |
| V14 Configuration | yes | No new keys; no new permissions (check that the manifest is unchanged) |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Page text or status text prompt-injects the model into proposing a consent/payment click | Tampering | Deterministic confirm floor; the model cannot remove a confirmation; element names spoken from the DOM |
| Self-confirmation via the screen reader's prompt picked up by the mic | Spoofing | Whole-utterance "tak" match; prompts not ending in "tak"; headset guidance |
| Stale or cross-document "tak" | Tampering | `docId`, `tabId`, TTL, epoch + identity drift check at execution |
| A page script forging the `confirmed` flag | Spoofing / Elevation | Flag exists only in SW -> content `runtime` messages (`sender.id` checked); page scripts cannot send them |
| Secret exfiltration through the transcript (user dictates a PESEL/BLIK code) | Information disclosure | Existing `maskText` on the transcript and the egress guard; add local refusal for secret requests |
| Parcel status (personal data) sent to the model | Information disclosure | Local quote, no model round trip, assert in e2e that it is absent from upstream bodies |
| Cookie consent given without informed user decision | Tampering | Consent-class detection by container, not by label; announce what it is |

## Validation Architecture

`workflow.nyquist_validation` is `false` in `.planning/config.json`, so no Nyquist section is required. A short map is still useful for the planner:

| Req | Test type | Where |
|-----|-----------|-------|
| INPOST-02 words/digits, 8/24 validation, grouping | unit | `shared/polish-speech.test.ts` |
| OUT-05 amounts/dates/ordinals/plurals, quote carve-out | unit | same |
| SAFE-01/02 routing, TTL, strict "tak", re-prompt | unit | `shared/pending.test.ts`, `shared/intent.test.ts` |
| SAFE-01 confirm-class matrix incl. consent | unit + dom-check | `validate.test.ts`, `e2e/dom-check.mjs` on `consent-banner.html` |
| SAFE-03 secret/captcha utterances | unit + e2e | `intent.test.ts`, `scenarios/secrets.mjs` |
| ACT-05 step budget | unit + e2e | `limits`/`pipeline.test.ts`, `scenarios/budget` |
| ACT-06 duplicate guard, `choose`, reply matching | unit + e2e + pytest | `intent.test.ts`, `scenarios/choice.mjs`, `server/tests/test_action.py` |
| INPOST-01/03 end to end on fixture | e2e | `scenarios/tracking.mjs` |
| Real InPost, NVDA, clean profile, real number | human | WINDOWS ledger (entries 4-7 already open from Phase 1) |

Existing commands: `npm --prefix extension test`, `npm --prefix extension run typecheck`, `npm --prefix extension run e2e`, `uv run --directory server pytest -q`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Whisper (pl) returns spoken Polish numbers as digit words, as digits, as digit groups or as hundreds-chunks; the parser covers all four forms | Polish speech | If it returns something else (e.g. fused words, "tysiące") the user gets "powtórz" loops; needs a live Whisper check on 24-digit dictation |
| A2 | Dictating 24 digits plus the preamble takes about 12-16 s | Pitfall 1 | If shorter, the 15 s cap is fine; if longer, truncation. Cheap to raise the cap anyway |
| A3 | A word-form digit readback is better than numerals for a Polish screen reader voice | Polish speech | Low; the words form is engine-independent |
| A4 | Free-standing integers are read acceptably by the user's Polish screen reader voice, so only identifiers/amounts/dates need rewriting | Polish speech | If not, extend `speakable()` to cardinals (case agreement is hard) |
| A5 | No existing zero-dependency npm package covers the inverse (ASR words -> digits) | Alternatives | Low; hand-rolling is about 60 lines and tested |
| A6 | The secret/captcha trigger word list is sufficient | Refusals | A missed phrase falls through to the model, where target-level `sensitive_fill` still blocks the fill; captcha clicks are impossible (iframe skipped) |
| A7 | A 60 s confirmation TTL and a 3-step cap are acceptable defaults | Confirmation flow | Tunable constants; user may want a longer TTL for slow users |
| A8 | "No extra model request" in roadmap criterion 3 excludes the speech-to-text request of the "tak" turn | Pitfall 6 | If the user means literally zero requests, a keyboard confirm shortcut would be needed (scope change) |
| A9 | The headless-UA difference in Didomi behaviour is caused by bot handling | Live findings | None for planning; fixture-based tests do not depend on the cause |
| A10 | Polish plural agreement rules for złoty/grosz/tysiąc stated as in standard grammar | Polish speech | Wrong plural in a spoken amount; covered by unit tests the executor writes from the rule table |
| A11 | Suggested Polish wording of the new prompts and refusals | Refusals, Confirmation | Wording is a product decision; check with a native speaker / the blind-user test |

## Open Questions

1. **Is "no extra model request" satisfied if the "tak" turn still calls `/api/transcribe`?**
   - Known: the transcript of "tak" must come from Whisper; matching is local; no `/api/action`, no `/api/effect` need happen.
   - Unclear: whether the user counts speech-to-text as a "model request".
   - Recommendation: treat criterion 3 as "no chat/planning/effect request"; state it in the plan and the human check; offer a keyboard confirm shortcut as a later option only if the user wants zero network.
2. **Does the user want the parcel number confirmed before filling (recommended) or after filling, before clicking?**
   - Recommendation: confirm first (nothing touched on the page until "tak"); fill and click then run as one bounded command.
3. **Should "ODRZUĆ WSZYSTKO" and "DOSTOSUJ" also require "tak"?**
   - Roadmap names "accepting"; SAFE-06 says banners are legal consent. Recommendation: every control inside the consent container requires "tak" (simplest and safe).
4. **Spoken prefix for the not-found message** ("Status na stronie:" vs "Strona informuje:"). Recommendation: `Strona informuje:` for `.error p`.
5. **Raise the 15 s recording cap?** Recommendation: yes for this phase (named constant), plus the two-step "podaj numer" dialog.

## Project Constraints (from CLAUDE.md)

- Code, identifiers, technical comments, commits in **English**; every user-facing string (voice and UI) in **Polish**.
- Section 3 non-negotiables: irreversible actions (payments, form submission, deletion, account change, legal consent) need a spoken "tak" and the agent announces first; the agent never enters passwords, SMS/BLIK codes and never passes captcha, it stops, says why and proposes human help; on doubt about the element the agent **asks** instead of guessing.
- Privacy: sensitive fields masked before anything leaves the content script; send the model the minimum; no API keys in the extension or repo; no logging of page content or commands.
- Section 4 speech style: short (one or two sentences), announce then effect, numbers and amounts spoken readably, errors stated plainly with a next step, never silence.
- Dependencies: add none without a clear reason. Phase 2 adds none.
- Tech stack overrides: TypeScript + esbuild extension, FastAPI + httpx proxy, `chrome.tts` fallback. Keep conversation/confirmation state in `chrome.storage.session`, not SW globals.
- Section 6 scope: do not add features beyond MVP (no scrolling, "powtórz", verbosity, earcons, stop command in this phase; those are Phases 3 and 4).
- Section 8: test with a real screen reader and check in the Network tab that sensitive data and, here, the parcel status never reach model requests.
- GSD workflow: file changes go through a GSD command (research only here).

## Sources

### Primary (HIGH confidence)
- Phase 1 code read this session: `extension/src/background/{index,pipeline,proxy}.ts`, `extension/src/content/{executor,index,live-region,settle,snapshot}.ts`, `extension/src/shared/{protocol,turn,validate,messages.pl,snapshot-format,mask,diff}.ts`, `extension/src/offscreen/offscreen.ts` (cap lines), `extension/static/manifest.json`, `extension/scripts/build.mjs`, `extension/e2e/{cdp.mjs,smoke.mjs,scenarios/refusals.mjs,scenarios/tracer.mjs,dom-check.mjs}`, `server/app/{main,schemas,prompts,openrouter,config,middleware,stt,stt_whisper}.py`, `server/tests/fake_openrouter.py`, `server/fixtures/{tracking-form,sensitive}.html`.
- Planning docs: `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `01-CONTEXT.md`, `01-04-SUMMARY.md`, `SKELETON.md`, `COVERAGE.md`, `.planning/WINDOWS.md`, `.planning/research/PITFALLS.md`.
- Live probes this session (CDP, Chromium 152.0.7977.82): inpost.pl tracking page markup, site JS `Drupal.behaviors.trackParcels` (downloaded and read), Didomi notice DOM and behaviour, XHR vs same-document navigation, result/error DOM for numbers `000000000000000000000001`, `999999999999999999999999`, `12345678`, `1234567`, `abcdefgh`, accessibility tree with the modal open, Phase 1 snapshot and policy on the live page.
- Baselines: `npm test` 103 pass, `npm run typecheck` clean, `uv run pytest -q` 63 pass.

### Secondary (MEDIUM confidence)
- https://platform.claude.com/docs/en/build-with-claude/structured-outputs — supported/unsupported JSON schema features and complexity limits (fetched this session via WebFetch).

### Tertiary (LOW confidence, marked `[ASSUMED]` above)
- Whisper output style for spoken Polish numbers, NVDA behaviour with `aria-modal` and colliding live regions, Polish TTS reading of numerals, Polish plural/ordinal rules (general knowledge, to be pinned by unit tests).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; versions read from repo files.
- Architecture / hook points: HIGH — every anchor read from source this session.
- InPost behaviour: HIGH for what was observed (XHR, DOM, Didomi, errors); gaps listed explicitly (real in-transit parcel, NVDA, regional Didomi variation).
- Polish speech: MEDIUM — algorithm prototyped and run on representative inputs; ASR behaviour and TTS reading are assumptions.
- Pitfalls: HIGH for those derived from code/probes (1 is MEDIUM on the speech-duration estimate).

**Research date:** 2026-10-03
**Valid until:** about 7 days for the live InPost findings (third-party site and CMP, fast-moving); 30 days for the Phase 1 hook points while Phase 1 remains unmodified.
