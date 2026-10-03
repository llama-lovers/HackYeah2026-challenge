---
phase: 02-safe-inpost-parcel-tracking
plan: 01
subsystem: accessibility
tags: [inpost, typescript, mv3, polish-speech, privacy, tdd]
requires:
  - phase: 01-voice-to-effect-vertical-slice
    provides: Recording, session turn ownership, masked snapshots, validated executor and navigation handoff
provides:
  - Local parcel dictation, digit-group readback, confirmation, search and verbatim DOM status
  - Session-stored parcel recovery dialog with bounded reprompts and expiry
  - Polish amount/date/identifier speech for model-authored sentences
  - Per-command action budget and local navigation effects
affects: [02-02, 02-03, page-exploration, audio-control]
tech-stack:
  added: []
  patterns: [pure reply routing, local parcel skill, session pending records, shared execution budget]
key-files:
  created:
    - extension/src/shared/limits.ts
    - extension/src/shared/limits.test.ts
    - extension/src/shared/polish-speech.ts
    - extension/src/shared/polish-speech.test.ts
    - extension/src/shared/intent.ts
    - extension/src/shared/intent.test.ts
    - extension/src/shared/parcel.ts
    - extension/src/shared/parcel.test.ts
    - extension/src/shared/pending.ts
    - extension/src/shared/pending.test.ts
    - extension/src/content/tracking.ts
    - extension/e2e/scenarios/tracking.mjs
  modified:
    - extension/src/background/pipeline.ts
    - extension/src/background/pipeline.test.ts
    - extension/src/shared/messages.pl.ts
    - extension/src/shared/messages.pl.test.ts
    - extension/src/shared/protocol.ts
    - extension/src/content/index.ts
    - extension/src/offscreen/offscreen.ts
    - server/fixtures/tracking-form.html
    - extension/e2e/scenarios/tracer.mjs
    - extension/e2e/scenarios/effect.mjs
    - extension/e2e/scenarios/turns.mjs
    - extension/e2e/scenarios/wav.mjs
    - extension/e2e/dom-check.mjs
key-decisions:
  - Read back and confirm the digit string before filling; all parcel planning and status speech stay local.
  - Mark every non-model execution job local so a navigation handoff cannot disclose a parcel status to the model.
  - Charge the budget immediately before sending a click/fill EXECUTE, including rejected or failed deliveries; reads and announcements are free.
  - Rewrite only model-authored sentences; preserve page status and local-effect text verbatim with an announced status length cut.
patterns-established:
  - Pending parcel replies are claimed atomically through runSerial before any model routing.
  - performProposal owns execution jobs and step counting for all callers; runParcelSearch awaits each step and refreshes the snapshot between actions.
requirements-completed: [INPOST-01, INPOST-02, INPOST-03, OUT-05, ACT-05]
coverage:
  - id: D1
    description: Parcel digit parsing, whole-utterance confirmation and safe selection boundaries
    requirement: INPOST-02
    verification:
      - {kind: unit, ref: "npm --prefix extension test (132 passed)", status: pass}
    human_judgment: false
  - id: D2
    description: Readback then confirmed fill/search and verbatim status with zero chat requests
    requirement: INPOST-03
    verification:
      - {kind: e2e, ref: "extension/e2e/scenarios/tracking.mjs", status: pass}
    human_judgment: false
  - id: D3
    description: Recovery, expiry, cancellation, leading zeros and 25-second recording cap
    requirement: INPOST-01
    verification:
      - {kind: unit, ref: "pending.test.ts and pipeline.test.ts", status: pass}
      - {kind: e2e, ref: "npm --prefix extension run e2e -- tracking turns wav (3/3)", status: pass}
    human_judgment: false
  - id: D4
    description: Natural Polish model speech and bounded verbatim status quotes
    requirement: OUT-05
    verification:
      - {kind: unit, ref: "polish-speech.test.ts and messages.pl.test.ts", status: pass}
    human_judgment: false
  - id: D5
    description: Three-step boundary, awaited execution, failure ordering and local navigation effects
    requirement: ACT-05
    verification:
      - {kind: unit, ref: "limits.test.ts and pipeline.test.ts", status: pass}
      - {kind: e2e, ref: "npm --prefix extension run e2e (9/9)", status: pass}
    human_judgment: false
  - id: D6
    description: Real InPost result/error/in-transit DOM, Polish screen-reader speech and real Whisper dictation
    verification: []
    human_judgment: true
    rationale: Linux fixture tests cannot establish NVDA/VoiceOver speech or the teammate's live Whisper output on a team-owned parcel.
actuals:
  tokens: 18914
  tasks: 3
  commits: 6
plan_head_before: 5bf0e4d5b9792b9cbea99dff1bc1e3f362c30108
plan_head_after: a3ab807fa1cba639b8e8977c459ba319d64b1711
duration: 34min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 1: Local InPost Parcel Tracking Summary

**Local Polish parcel dictation and confirmed search quote the page status without a chat request, with bounded actions and natural Polish model speech.**

## Performance

- Duration: 34 minutes measured from the first recorded RED run; initial context loading and Phase 1 precondition setup are excluded.
- Recorded execution start: 2026-10-03T18:36:54Z.
- Completed verification: 2026-10-03T19:10:40Z.
- Tasks: 3; changed implementation/test files: 25.
- Actual token estimate: 18,914, calculated as ceiling of realized committed diff characters divided by four. Six task commits measured from the persisted plan ledger; the subsequent SUMMARY metadata commit is excluded from that interval.

## Accomplishments

- Tracking intent routes locally. Eight- and twenty-four-digit identifiers remain strings, including leading zeros; supported digit words and hundreds chunks produce the same number. The user hears individual digit words grouped by four before any fill or search.
- A session-stored dialog accepts only whole-utterance confirmation, supports number-only replies, cancels after one unsuccessful reprompt, rejects expired confirmations, and reports missing forms and site errors locally.
- The validated executor fills and clicks in order with fresh snapshot IDs. READ_STATUS selects the wrapper by exact string equality and uses collapsed raw textContent, preserving links' text and identifiers the snapshot masker would hide.
- Model-authored amounts, dates and identifiers become Polish words. Page quotations and element names bypass that rewriting. Long statuses retain a verbatim prefix and announce the cut.
- Each spoken turn receives a fresh three-step budget; only click/fill EXECUTE messages consume it. Rejected fills and delivery failures stop before the click. Local execution jobs remain local across navigation.

## Task Commits

1. Task 1 RED: `ad85a91` — define local parcel dialog behavior.
2. Task 1 GREEN: `161e05d` — deliver local parcel confirmation and status tracer.
3. Task 2 RED: `ad0d694` — cover dictated numbers and parcel recovery.
4. Task 2 GREEN: `4375d9e` — support Polish dictation and bounded recovery.
5. Task 3 RED: `4a855e7` — specify natural speech, step budgets and local handoffs.
6. Task 3 GREEN: `a3ab807` — bound action steps and speak Polish numbers locally.

No refactor commit was necessary. All commits used repository hooks. No tracked files were deleted. Existing config and runtime planning edits were preserved.

## TDD Gate Compliance

All three tasks followed RED → GREEN with intentional named assertion failures verified by `check tdd-red-evidence` before production edits. Missing modules were loaded conditionally in new tests so RED failed on expected behavior assertions rather than import crashes.

| Task | Named RED target | RED tests/pass/fail | Verified verdict | GREEN |
|---|---|---|---|---|
| 1 | parcel readback speaks individual digits in groups of four | 7/0/7 | RED_EVIDENCE_OK | 110 passing tests |
| 2 | Polish chunks normalize every supported ASR rendering without guessing | 26/20/6 | RED_EVIDENCE_OK | 119 passing tests |
| 3 | third step executes fourth stops and every command owns a fresh budget | 38/27/11 | RED_EVIDENCE_OK | 132 passing tests |

RED evidence records and TAP output were persisted under `/tmp/02-01-task{1,2,3}-red.{json,log}`. Task 1 expected Polish digit groups but received undefined; Task 2 expected the same digit string but rejected hundreds words; Task 3 expected a stopped fourth action but executed it. The committed tracer was reverified end to end before expansion: units, typecheck, DOM check and tracer/effect/tracking 3/3.

## Verification

- Required precondition: unmodified Phase 1 `npm --prefix extension run e2e -- tracer` passed 1/1 before edits.
- `npm --prefix extension test`: 132 passed, zero failures/skips/todos.
- `npm --prefix extension run typecheck`: passed.
- `npm --prefix extension run dom-check`: all checks passed, including masking, live policy drift, native-write safety and fixture result structure.
- Task 1 `npm --prefix extension run e2e -- tracer effect tracking`: 3/3; repeated after the committed tracer at the feedback gate.
- Task 2 `npm --prefix extension run e2e -- tracking turns wav`: 3/3, including actual 25-second auto-stop in both recording modes.
- Final `npm --prefix extension run e2e`: 9/9 — effect, navigation, onboarding, privacy, refusals, tracer, tracking, turns, wav.
- `uv run --directory server pytest -q`: 63 passed, one pre-existing dependency deprecation warning.
- Build and prescribed key-hygiene checks passed; no tracked server/.env or key-shaped strings in source/bundles/history tip. The manifest is unchanged.
- All task acceptance checks passed: READ_STATUS handlers, shared execution helper and pending key, real fixture selectors, no masking import in the status reader, recording-cap references, speech rewriting and step accounting.

## Decisions Made

The adopted plan assumptions remain binding: confirm before fill, quote site errors with “Strona informuje”, use a 25-second recording cap below the 30-second turn staleness, and exclude transcription from the zero-chat-request guarantee. The same-checkout phase branch follows the existing project decision and preserves the user's work.

## Deviations from Plan

No architectural or scope deviations. The leading-zero boundary also received an end-to-end fill and wrapper-lookup assertion, in addition to the planned unit coverage. Injected budgets fail closed for noninteger or negative counts.

## Issues Encountered

- Sandbox restrictions prevented uv cache access and Node worker/subprocess reporting. Authorized escalated runs established the precondition and all automated checks; no dependencies were added or substituted.
- Task 1 verification exposed a nullable pending guard and an invalid top-level-await expression in the E2E assertion. Both were corrected before GREEN and all checks rerun.
- Task 3 typechecking required the test button's kind to remain an interactive literal. It was corrected and the final unit/type checks passed.
- The backend reports a pre-existing Starlette/httpx deprecation warning. It is outside this plan; no backend dependency changes were made.

## Known Stubs

None introduced by this plan. Empty arrays/strings in tests and proposal fields are intentional test inputs or protocol values, and HTML placeholder attributes are real field hints. The existing teammate-owned STT seam and its intentional fixture mode remain tracked separately in WINDOWS.md.

## Human Verification Remaining

On Windows with NVDA or macOS with VoiceOver, using a headset and the extension on https://inpost.pl/sledzenie-przesylek:

1. Dictate `000000000000000000000001` as digit words. Hear separate digits in six groups and “Powiedz tak albo nie”; say “tak” and hear fill, click, then the page's “Anulowano etykietę” status in Polish.
2. Repeat with `999999999999999999999999`; hear the site's own not-found sentence with “Strona informuje”. This verifies the real error wrapper structure.
3. Dictate a real team-owned parcel number through the teammate's Whisper module at a natural pace. Verify all twenty-four digits fit under 25 seconds and the actual in-transit description, links and dates are quoted in full or with “Dalszy opis jest na stronie”. A native speaker should listen to amount/date phrasing once.
4. Inspect DevTools Network for these turns: only transcription requests; no /api/action or /api/effect. These backstop checks remain human judgment, not automated successes.

## Next Phase Readiness

Plans 02-02 and 02-03 can extend PendingInteraction and routeReply and use the exported CommandRun, performProposal and local-effect path. There are no automated blockers. Shared STATE.md, ROADMAP.md and requirements updates belong to the orchestrator after this committed SUMMARY; this executor did not mutate them.

## Self-Check: PASSED

All twelve created implementation/test artifacts exist. All six task commits resolve in git. The measured interval contains six commits, every task's acceptance checks passed, and the final automated suite is green.
