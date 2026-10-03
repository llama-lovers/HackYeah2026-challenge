---
phase: 01-voice-to-effect-vertical-slice
fixed_at: 2026-10-03T19:00:00Z
review_path: /home/bartos/HackYeah2026-challenge/.planning/phases/01-voice-to-effect-vertical-slice/01-REVIEW.md
iteration: 1
findings_in_scope: 12
fixed: 12
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-10-03
**Source review:** .planning/phases/01-voice-to-effect-vertical-slice/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 12 (10 critical, 2 warning)
- Fixed: 12
- Skipped: 0

The run was resumed after an interrupted one. CR-01, CR-02 and CR-10 were committed by the earlier run and are recorded here as fixed from those commits. The orphan worktree `rf-01-repair`, its branch and its recovery sentinel were removed. Its uncommitted CR-03 patch was applied to a new worktree, reviewed and reworked (see CR-03).

CR-03, CR-05, CR-06, CR-07, CR-08 and CR-09 are logic or state-machine fixes. Unit tests and the browser checks pass, but they only prove the cases written for them. A developer should confirm the behavior on a real page and with a screen reader, so they are marked "requires human verification" below.

## Fixed Issues

### CR-01: Adjacent numeric tokens bypass the checksum masker

**Files modified:** `extension/src/shared/mask.ts`, `extension/src/shared/mask.test.ts` and related (earlier run)
**Commit:** afdf6e8
**Applied fix:** adjacent numeric identifiers are tokenized and masked separately.

### CR-02: Text aggregation and field metadata bypass sensitive-value masking

**Files modified:** `extension/src/content/snapshot.ts` and related (earlier run)
**Commit:** 2439594
**Applied fix:** secret echoes are scrubbed from snapshot metadata and aggregated text.

### CR-10: Structural containers suppress visible actionable descendants

**Files modified:** `extension/src/content/snapshot.ts` and related (earlier run)
**Commit:** ead3d46
**Applied fix:** the walker traverses structural and live containers.

### CR-03: Irreversible clicks pass the local safety floor under common Polish labels (fixed: requires human verification)

**Files modified:** `extension/src/shared/validate.ts`, `extension/src/shared/validate.test.ts`, `extension/src/content/snapshot.ts`, `extension/e2e/dom-check.mjs`
**Commits:** bc37b97, 34ba92e, 811ffb5 (three commits: the initial fix and two hardening passes requested by the coordinator after security review)
**Applied fix:**
- The saved WIP patch was reworked. Its blanket `safeClick === false` rule would have blocked the demo's "Pokaż mapę" button, so it was replaced by a positive classification (`knownSafe`).
- `SIDE_EFFECT_RE` now covers payment, account-change and consent wording ("Potwierdź płatność", "Zapisz zmiany", "Wyrażam zgodę na regulamin", "Potwierdź zakup", logout and similar).
- The wording is checked against the name, visible text, aria-label, title, `formaction`, and decoded link path, query and hash.
- A control inside or submitting a form is refused unless the form is a positively identified lookup. A lookup form must:
  - use GET, with only an absent or explicit `get` accepted for both `method` and `formmethod`;
  - have a same-origin action and `formaction`, resolved against `document.baseURI`, with a same-origin base;
  - have no sensitive, checkbox, radio, file or password fields;
  - have no payment or consent signals in its action, id, name, label, field names or hidden values;
  - contain a parcel or search-like field;
  - use a lookup-named submit button.
- Form membership is read through the `HTMLFormElement.elements` getter. This follows `form=` owners both ways.
- DOM clobbering is blocked. Every element member used by the walker and by the policy code is read through prototype accessors. Any control, image or object named like a form member (`action`, `id`, `method`, `elements`, ...) makes the form non-lookup.
- Clicks outside forms are allowed only for genuine http(s) anchors, or for controls named like a lookup ("Szukaj", "Znajdź", ...) or a harmless disclosure ("Pokaż mapę", "Zamknij", "Pomoc", ...). Everything else (JS buttons, role=button divs, checkboxes, unclassified names such as a bare "Dalej") gets the existing confirmation-required sentence.
- `validateProposal` now requires `knownSafe` and `!sideEffectSignals` for clicks. Any exception while collecting signals counts as unsafe.
- Regression tests: 27 click policy cases in `dom-check` (clobbered forms, `form=` owners, `<base href>`, invalid methods, cross-origin and side-effect actions, disguised search forms, unclassified clickables, the allowed demo controls) plus unit tests.

**Known trade-off:** on a real page whose navigation is wrapped in one big `<form>`, ordinary buttons and links inside it are refused as uncertain. Real InPost pages were not checked for this.

### CR-04: Synchronous focus handlers can invalidate policy before the native fill

**Files modified:** `extension/src/content/executor.ts`, `extension/e2e/dom-check.mjs`
**Commit:** fe2153e
**Applied fix:** the fill path now focuses first. It then resolves and validates the same target again and checks element identity and type, and only then writes. The settle watch starts after that check. A `dom-check` regression turns the field into a password on focus. It fails without the fix and passes with it, and the field value stays empty.

### CR-05: Concurrent shortcut handlers overwrite the recording owner (fixed: requires human verification)

**Files modified:** `extension/src/background/pipeline.ts`, `extension/src/shared/turn.ts`, `extension/src/shared/turn.test.ts`, `extension/src/background/pipeline.test.ts` (new)
**Commit:** 24af9b2
**Applied fix:**
- State-changing events (shortcut toggles, offscreen notifications) run through one serial queue. Long work stays outside it so a new press can still answer "busy".
- A toggle reserves the recording owner, with a new turn id, before the ping and offscreen setup. Setup failures release only their own reservation (`resetTurnIf(id)`).
- Tests: a rapid double toggle gives one start then one stop and keeps the owner; shortcuts from two tabs create one owner; a setup failure cannot reset a newer turn.

### CR-06: Stale recovery and delayed events have no turn identity or cancellation (fixed: requires human verification)

**Files modified:** `extension/src/shared/protocol.ts`, `extension/src/shared/turn.ts`, `extension/src/shared/turn.test.ts`, `extension/src/offscreen/offscreen.ts` (rewritten), `extension/src/background/pipeline.ts`, `extension/src/background/proxy.ts`, `extension/src/background/pipeline.test.ts`, `extension/e2e/scenarios/navigation.mjs`, `extension/e2e/scenarios/onboarding.mjs`
**Commit:** d44ea95
**Applied fix:**
- A turn id is carried through `REC_START`, `REC_STOP`, every offscreen event and the pending job. Events from a turn that no longer owns the pipeline are dropped.
- The offscreen document keeps one capture object per turn. A new turn id discards the old capture: it releases the microphone and aborts the upload.
- Each turn has an `AbortController` used for the model and effect requests. Stale recovery aborts the old turn and removes its pending job. `runCommand` checks ownership after every await.
- Stopping a recording now refreshes the processing deadline (`startedAt`).
- READY cleanup resets by turn id, not by tab id.
- Tests: late transcript, error, mic and stop events after recovery are ignored, on a different tab and on the same tab. Stale recovery aborts an in-flight model request without any EXECUTE.
- Two e2e scenarios were updated to carry turn ids, because they inject state or messages directly.

### CR-07: Navigation jobs announce actions that never executed (fixed: requires human verification)

**Files modified:** `extension/src/background/pipeline.ts`, `extension/src/background/index.ts`, `extension/src/content/executor.ts`, `extension/src/content/index.ts`, `extension/src/shared/protocol.ts`, `extension/src/shared/validate.ts`, `extension/src/shared/messages.pl.ts`, `extension/src/shared/messages.pl.test.ts`, `extension/src/background/pipeline.test.ts`, `extension/e2e/scenarios/navigation.mjs`
**Commit:** e813e6d (shared with CR-08, see note)
**Applied fix:**
- A job is only a proposal (`state: 'proposed'`) until the content script sends `EXECUTING`. The content script sends it right before the side effect, and the background acknowledges it. Without the acknowledgement the executor does nothing and returns the new rejection `unconfirmed`.
- The executor re-validates once more after the acknowledgement.
- Only an `executed` job can be handed off to the next document. A READY that finds a `proposed` job drops it silently, so there is no false "Kliknąłem".
- A delivery failure before execution announces the new message "Nie udało się wykonać tej akcji. Spróbuj jeszcze raz." and releases the turn.
- `EXECUTING` is accepted only for the matching turn, tab and job id.
- Tests: delivery failure then READY, a reload during the announcement delay, a proven navigation hand-off, and forged confirmations.

### CR-08: Every EXECUTE transport failure becomes an unbounded silent handoff (fixed: requires human verification)

**Files modified:** same as CR-07
**Commit:** e813e6d (shared with CR-07, see note)
**Applied fix:**
- Only an execution-committed job becomes a hand-off. Other delivery failures and `none` proposals fail locally and release the turn.
- A committed job expires on a timer (15 s) that does not depend on a READY. Expiry removes the job, announces "Wykonałem polecenie, ale nie mogę potwierdzić, co się zmieniło na stronie." via the tab or TTS fallback, and releases the turn.
- Closing the tab removes the job and releases the turn (`tabs.onRemoved`). Stale recovery removes the job.
- READY after expiry gives the same uncertainty announcement.
- Tests: expiry without READY, tab closure, and a `none` proposal.

**Known limit:** the expiry timer is a `setTimeout` in the service worker. If Chrome kills the worker within the 15 s window, expiry falls back to the next READY or to the 30 s stale recovery. `chrome.alarms` was not added, because it needs a new permission.

### CR-09: An epoch-bound element can change meaning without invalidating the proposal (fixed: requires human verification)

**Files modified:** `extension/src/content/snapshot.ts`, `extension/src/content/index.ts`, `extension/src/shared/validate.ts`, `extension/src/shared/validate.test.ts`, `extension/src/shared/protocol.ts`, `extension/src/background/pipeline.ts`, `extension/src/background/pipeline.test.ts`, `extension/e2e/dom-check.mjs`
**Commit:** f7482d8
**Applied fix:**
- Each snapshot target stores an identity fingerprint: role, name, tag, type, name attribute, placeholder, autocomplete, link href, `formaction`/`formmethod` and the form's action, method and id. `resolveTarget` marks drift, and validation refuses it with `stale`. The drift check runs last, so more specific refusals such as sensitive or irreversible still win.
- Each document gets an id. The snapshot result carries it, `EXECUTE` carries it back, and the content script refuses a proposal made against another document instance.
- Tests: href, purpose, input type, rename and form action drift during model latency, and a rename during the announcement delay.

### WR-01: Repeated utterances can reuse old listening/processing evidence

**Files modified:** `extension/e2e/smoke.mjs`, `extension/e2e/live-log.mjs` (new), `extension/e2e/live-log.test.mjs` (new), `extension/package.json`
**Commit:** bfb1543 (shared with WR-02)
**Applied fix:** `speak` marks the page's live-log length before toggling. String waits then only see entries added since the mark. A mark beyond the log length is treated as a restarted document. The helper has unit tests, which `npm test` now includes. A real delayed second microphone open, or an intentionally missing second announcement, was not exercised in a browser.

### WR-02: Timed-out scenarios continue mutating the next scenario's browser

**Files modified:** `extension/e2e/smoke.mjs`
**Commit:** bfb1543 (shared with WR-01)
**Applied fix:** on timeout the browser and CDP client are closed and the build signature is cleared. The next scenario gets a fresh browser and profile, and the zombie scenario's later calls fail on the closed connection. A deliberately hanging temporary scenario (not committed) timed out, its late toggle never ran, and the next scenarios passed.

**Commit note:** CR-07/CR-08 and WR-01/WR-02 overlap heavily in the same files (the job state machine; the e2e harness), so each pair was committed together instead of one commit per finding. CR-03 has three commits.

## Verification

- Environment: an isolated git worktree (`gsd-reviewfix/01-364985`) with `extension/node_modules` and `server/.venv` symlinked from the main checkout. The symlinks were removed before the worktree was torn down, and nothing was `rm -rf`'d. The branch was fast-forwarded onto `gsd/phase-01-voice-to-effect-vertical-slice` (HEAD bfb1543) and then removed.
- Extension unit tests (`npm test`): 103/103 pass (baseline was 78 before this run, 79 at the start of it). `tsc --noEmit` is clean. Both ran in the worktree and again in the main checkout after the merge.
- Server tests (`uv run pytest`): 53/53 pass, in the worktree and again in the main checkout.
- `npm run dom-check` (real Chromium, DOM probes): all 13 checks pass, in the worktree.
- `npm run e2e` (fake OpenRouter, stub STT, real Chromium with the extension): 8/8 scenarios pass, in the worktree. Run twice: before and after the WR changes.
- Not covered: real NVDA/VoiceOver speech, live InPost pages, live OpenRouter/Whisper, and a clean-profile microphone grant. These remain pending as in the review.

---

_Fixed: 2026-10-03_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
