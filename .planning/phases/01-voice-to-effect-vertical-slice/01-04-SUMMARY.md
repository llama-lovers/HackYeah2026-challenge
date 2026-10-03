---
phase: 01-voice-to-effect-vertical-slice
plan: 04
subsystem: extension
tags: [typescript, chromium, mv3, accessibility, privacy, diff, navigation]
requires:
  - phase: 01-03
    provides: Voice runtime, masked action pipeline, FIFO live region and Chromium harness
provides:
  - Capped deterministic masked snapshot differences and semantic settle watcher
  - Diff-grounded effect speech with empty-diff templates and failure fallback
  - Once-only session-backed navigation effect handoff with silent stale expiry
  - Chromium turn/refusal/privacy proof and explicit end-of-phase human checks
affects: [02-safe-inpost-parcel-tracking, 03-page-exploration, 04-audio-control]
tech-stack:
  added: []
  patterns: [masked snapshot reuse, ordinal control matching, multiset text comparison, awaited pre-announcement, serialized READY claim]
key-files:
  created:
    - extension/src/shared/diff.ts
    - extension/src/shared/diff.test.ts
    - extension/src/content/settle.ts
    - extension/e2e/scenarios/effect.mjs
    - extension/e2e/scenarios/navigation.mjs
    - extension/e2e/scenarios/turns.mjs
    - extension/e2e/scenarios/refusals.mjs
    - extension/e2e/scenarios/privacy.mjs
    - .planning/phases/01-voice-to-effect-vertical-slice/01-04-task1-red.json
  modified:
    - extension/src/content/executor.ts
    - extension/src/content/index.ts
    - extension/src/content/live-region.ts
    - extension/src/background/pipeline.ts
    - extension/src/background/index.ts
    - extension/e2e/scenarios/tracer.mjs
    - extension/e2e/scenarios/onboarding.mjs
    - extension/e2e/smoke.mjs
key-decisions:
  - Await the FIFO live-region write before starting the pre-action delay so navigation cannot erase a queued announcement.
  - Serialize READY consumers before deleting a session job to prevent duplicate effect claims.
  - Preserve complete-token secret assertions alongside intentionally unmasked parcel-number positive controls.
requirements-completed: [ACT-02, ACT-07, OUT-01, ACT-04, SAFE-04, PROXY-01, PROXY-03]
coverage:
  - id: masked-diff
    description: Identity, state/value transitions, duplicate ordinals, multiset surplus and Unicode caps
    verification: [{kind: unit, ref: extension/src/shared/diff.test.ts, status: pass}]
    human_judgment: false
  - id: effect
    description: Fill/click effects wait past the loader, ignore SVG churn, use only the masked diff, and announce no-change or failure templates
    requirement: ACT-07
    verification: [{kind: e2e, ref: extension/e2e/scenarios/effect.mjs, status: pass}]
    human_judgment: false
  - id: navigation
    description: Pre-announcement survives unload and the new page consumes one effect job; expired jobs are silent
    verification: [{kind: e2e, ref: extension/e2e/scenarios/navigation.mjs, status: pass}]
    human_judgment: false
  - id: turns-dom
    description: FIFO DOM mutations include two identical busy announcements, empty transcript guard, offsite fallback and actual 15-second cap
    verification: [{kind: e2e, ref: extension/e2e/scenarios/turns.mjs, status: pass}]
    human_judgment: false
  - id: refusals
    description: Missing/disabled/mismatched/sensitive targets and payment proposals execute no action
    requirement: ACT-04
    verification: [{kind: e2e, ref: extension/e2e/scenarios/refusals.mjs, status: pass}]
    human_judgment: false
  - id: privacy
    description: Fixture secrets never reach upstream, parcel numbers remain visible and proxy logs contain no bodies
    requirement: SAFE-04
    verification: [{kind: e2e, ref: extension/e2e/scenarios/privacy.mjs, status: pass}]
    human_judgment: false
  - id: keys
    description: Extension sources/bundles and tracked files contain no key and server/.env is untracked
    requirement: PROXY-01
    verification: [{kind: other, ref: '01-04-PLAN.md Task 3 key-absence command', status: pass}]
    human_judgment: false
  - id: screen-reader
    description: NVDA/VoiceOver actually speaks ordered and identical messages in browse mode and with parcel-field focus
    requirement: OUT-01
    verification: [{kind: manual_procedural, ref: '01-04-PLAN.md Task 3 screen-reader human-check', status: unknown}]
    human_judgment: true
    rationale: Linux Chromium DOM mutations cannot establish actual assistive-technology speech or absence of duplicate voices.
  - id: network-demo
    description: DevTools Network-tab proof on the sensitive fixture and live InPost parcel page
    verification: [{kind: manual_procedural, ref: '01-04-PLAN.md Task 3 Network-tab human-check', status: unknown}]
    human_judgment: true
    rationale: The project requires the demo artifact to be inspected by a person.
  - id: live-provider
    description: Live InPost fill/search/navigation produces faithful Polish effects with measured total latency
    verification: [{kind: manual_procedural, ref: '01-04-PLAN.md Task 3 live-site human-check', status: unknown}]
    human_judgment: true
    rationale: Real provider credentials, teammate Whisper module and human observation remain unavailable.
actuals:
  tokens: 11952
  tasks: 3
  commits: 4
commits: 4
plan_head_before: 51dd6da28343766b81e1d74edbdce745b14f23ad
plan_head_after: 175d573534657d2ce52e65b26bd018a02598f489
duration: 22min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 4: Settled Effects and Navigation Summary

**Masked deterministic page differences drive effect speech after fill/click and full navigation, with explicit no-change/failure templates and eight passing Chromium scenarios.**

## Performance

- Recorded start: 2026-10-03T14:11:43Z; completed production work: 2026-10-03T14:32:27Z.
- Tasks: 3; realized production/evidence files: 17, including nine created files.
- Actual tokens are ceil(realized Git diff characters / 4), measured over the persisted plan ledger through plan_head_after. Four task commits exclude summary/state close-out metadata and pre-existing config/runtime edits.

## Accomplishments

- Match interactive controls by role/name/ordinal instead of transient IDs; compare text and alerts by multiset surplus. Cap arrays at 8/5/8/3 and every string at 160 Unicode code points. Inputs are already masked snapshots.
- Observe semantic DOM changes before click/fill, wait for an 800 ms quiet window without visible loaders/busy controls, cap at 6 seconds and ignore SVG/agent-region/ad churn. Re-snapshot through the same source masker.
- Send only action metadata plus diff to /api/effect. Empty differences skip the model and speak the fixed no-change sentence; failed effect calls speak the fixed fallback. Template pre-lines never use model say.
- Persist the masked pre-snapshot before execution. Top-frame READY consumes the tab-owned job once, settles/diffs on the new page, announces, resets the turn and silently drops jobs older than 15 seconds. Content-script access to session storage remains disabled.
- Prove real Chromium fills, delayed results, preserved pre-navigation speech mutation, stale-job cleanup, busy adjacency/FIFO, local empty handling, offsite TTS, recording cap, refusals, masking and body-free logs.

## Task Commits

1. Task 1 RED: `1ea5601`; GREEN: `08cb936`. Eight diff tests passed; all 78 unit tests/typecheck passed. Chromium tracer/effect **2/2 passed**, then the complete tracer verification reran successfully before expansion.
2. Task 2: `9b646a2`. Typecheck and Chromium tracer/effect/navigation **3/3 passed**. The navigation scenario checks pre-unload live-log evidence, one effect request/announcement, no pending key and silent 20-second stale expiry.
3. Task 3: `175d573`. Final full Chromium **8/8 passed**; 53 server tests, 78 unit tests, typecheck, build and key-absence gate passed.

## Verification

- Final `npm --prefix extension run e2e`: **8/8 passed**. effect 11895 ms; navigation 6032 ms; onboarding 984 ms; privacy 1813 ms; refusals 7565 ms; tracer 3716 ms; turns 21980 ms; wav 21776 ms. No FAIL lines in the successful run.
- Effect asserts the result sentence arrives less than 3800 ms after the click pre-line despite three seconds of SVG churn, contains the actual delayed status in its diff request, sends no page snapshot and makes no effect call for the no-op map click. Forced effect-request failure produces the exact fixed fallback.
- Turns checks two separate identical busy mutations, ordered listening/processing/pre/effect lines, no action request for whitespace, Polish offsite TTS with idle turn, and an actual cap between 14 and 18 seconds without a second toggle.
- Refusals checks exact sentences and unchanged DOM/password/payment state. The deterministic fake always sets needs_confirmation=false, so payment refusal is enforced by the extension.
- Privacy checks every specified secret individually (invalid PESEL by complete digit-token boundaries), at least ten `[ukryte]` markers, both parcel positive controls and absence of body/query text in the proxy's complete output.
- `uv run --directory server pytest -q`: **53 passed**, one pre-existing Starlette/httpx deprecation warning. `npm --prefix extension test`: **78 passed, 0 failed, 0 skipped**. Typecheck and production build exit 0.
- Key-shaped-string scan over extension/src, dist, dist-e2e and tracked files is clean; server/.env is untracked. No dependency/lockfile changes.
- Every task artifact acceptance passed. No source TODO/FIXME, skipped tests or new functional stub remains. No additional threat surface beyond the plan's diff/effect/session trust boundaries was introduced.

## TDD Gate Compliance

The named parcel-value test intentionally failed on an assertion: expected one value change, actual empty changed array. Seven of eight planned tests failed on behavior assertions, not imports. `01-04-task1-red.json` was accepted as **RED_EVIDENCE_OK** before implementation. RED `1ea5601` precedes GREEN `08cb936`; all eight diff tests now pass. No separate refactor was needed.

## Deviations from Plan

1. **[Rule 2 - Missing Critical] Await the queued pre-announcement:** the first navigation regression captured beforeunload log containing only Słucham/Przetwarzam. A fixed 300 ms delay began before the FIFO queue wrote Klikam. The announcer now resolves after its text mutation; executor awaits that write before its delay. `live-region.ts` and `executor.ts`, verified by navigation and prior effect/tracer checks (`9b646a2`). This proves DOM delivery; screen-reader utterance still needs human testing.
2. **[Rule 1 - Bug] Contradictory secret-prefix assertion:** requiring literal absence of `12345678901` while requiring `123456789012345678901234` is impossible. As established in 01-02, assert absence as a complete digit token while retaining the parcel positive control. All actual protected fixture fields remain masked (`privacy.mjs`, `175d573`).
3. **[Rule 3 - Blocking] Harness lifecycle/capture assumptions:** adding effect/navigation ahead of onboarding exposed its fresh-install dependency. The scenario explicitly requests a fresh browser from the runner. Busy capture waits 800 ms so the existing sub-1 KB empty-audio guard does not discard it. Autonomous stop has no explicit REC_STOP payload, so turns intercepts only the test transcriber URL to supply the requested map phrase; production behavior is unchanged. Full 8/8 proves both setup corrections (`onboarding.mjs`, `smoke.mjs`, `turns.mjs`, `175d573`).

## Issues Encountered

Chromium/Node workers and Git mutation required approved escalation. The navigation test's initial top-level await expression was replaced with a CDP-compatible Promise expression. The initial full run had the two harness assumption failures above; the final full run passed all scenarios. No authentication gate occurred because offline tests use the authorized fake upstream and stub seam.

## Known Stubs and Human Checks Collected

This plan adds no product stub. The existing explicitly planned teammate STT stub remains in WINDOWS entry 3. **Plan execution is complete; phase acceptance is still pending.** Requirements metadata lists delivered implementation, not a fabricated human result.

- **WINDOWS 5, pending:** NVDA/VoiceOver speech of ordered and identical consecutive messages in browse mode and with parcel-field focus is pending real screen-reader testing. Build for the target proxy address, use a headset and the stub fill/search phrases, press Alt+Shift+A, then press twice while processing. Hear every intended line once, both busy lines, Polish speech and no duplicate voices.
- **WINDOWS 6, pending:** DevTools Network-tab masking proof on the sensitive fixture and live InPost parcel page is pending end-of-phase human review. Inspect the worker's action payload: protected fields masked, parcel number intact, requests only to proxy origin.
- **WINDOWS 7, pending:** Live InPost fill/search/navigation with real provider Polish effect quality and total latency is pending an API key and human review. On real tracking, fill a 24-digit parcel, click Znajdź then Szukaj; hear truthful Polish effects including translated English error text and record time from the second keypress (target about eight seconds).

Existing WINDOWS 1/2/4 still require real provider schema/latency, teammate Whisper with real microphone audio, and clean-profile microphone/shortcut/accessibility checks. None is marked passed or waived. The orchestrator should consolidate these with all plan human-check blocks into end-of-phase UAT before marking the phase complete.

## Next Phase Readiness

All four Phase 1 plans have implementation summaries. Run phase verification and the genuine end-of-phase human checks before transition. Future plans can reuse diff/effect/navigation contracts without accessing session storage from content scripts. Preserve awaited pre-announcement writes and the deterministic policy floor.

## Self-Check: PASSED

All nine created files exist and all four task hashes resolve. All automated acceptance gates passed. No unexpected tracked-file deletion occurred. Summary is committed before state/roadmap advancement; config/runtime edits remain preserved.
