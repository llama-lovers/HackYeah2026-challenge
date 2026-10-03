---
phase: 02-safe-inpost-parcel-tracking
plan: 02
subsystem: safety
tags: [confirmation, consent, chrome-mv3, polish, tdd]
requires:
  - phase: 02-01
    provides: Local pending dialogs, execution helper, bounded steps and local effects
provides:
  - Exact-proposal irreversible-action confirmation with whole-utterance tak
  - Informed confirmation for Didomi and generic cookie-dialog controls
  - Atomic owner-bound consumption, expiry, cancellation and stale-document refusal
affects: [02-03, phase-verification]
tech-stack:
  added: []
  patterns: [content-script confirmation classification, stored-proposal execution, local confirmed effects]
key-files:
  created:
    - extension/e2e/scenarios/confirm.mjs
    - extension/e2e/scenarios/consent.mjs
    - server/fixtures/consent-banner.html
  modified:
    - extension/src/shared/validate.ts
    - extension/src/shared/validate.test.ts
    - extension/src/content/executor.ts
    - extension/src/content/index.ts
    - extension/src/content/snapshot.ts
    - extension/src/shared/protocol.ts
    - extension/src/shared/pending.ts
    - extension/src/shared/pending.test.ts
    - extension/src/shared/messages.pl.ts
    - extension/src/shared/messages.pl.test.ts
    - extension/src/background/pipeline.ts
    - extension/src/background/pipeline.test.ts
    - server/fixtures/sensitive.html
    - extension/e2e/scenarios/refusals.mjs
    - extension/e2e/scenarios/privacy.mjs
    - extension/e2e/dom-check.mjs
key-decisions:
  - "Confirmed replies execute the original proposal, epoch and document without a new snapshot or chat request; transcription remains allowed."
  - "Every consent-container control requires confirmation, including reject, customize, close and policy links."
  - "Pending claims check turn ownership inside the same serial operation that reads and removes them."
requirements-completed: [SAFE-01, SAFE-02, SAFE-06]
coverage:
  - id: D1
    description: Exact irreversible proposal executes once only after locally matched tak, with a local effect
    requirement: SAFE-01
    verification:
      - {kind: unit, ref: extension/src/background/pipeline.test.ts, status: pass}
      - {kind: e2e, ref: extension/e2e/scenarios/confirm.mjs, status: pass}
    human_judgment: false
  - id: D2
    description: Confirmed direct and navigating actions send no action or effect planning request
    requirement: SAFE-02
    verification:
      - {kind: unit, ref: extension/src/background/pipeline.test.ts, status: pass}
      - {kind: e2e, ref: extension/e2e/scenarios/consent.mjs, status: pass}
    human_judgment: false
  - id: D3
    description: Didomi and generic cookie controls require an informed consent prompt
    requirement: SAFE-06
    verification:
      - {kind: automated_ui, ref: extension/e2e/dom-check.mjs, status: pass}
      - {kind: e2e, ref: extension/e2e/scenarios/consent.mjs, status: pass}
    human_judgment: false
  - id: D4
    description: Real clean-profile InPost Didomi confirmation is audible and intelligible through NVDA
    verification: []
    human_judgment: true
    rationale: Linux automation cannot verify NVDA pronunciation or real profile-dependent banner behavior
actuals:
  tokens: 13346
  tasks: 3
  commits: 6
plan_head_before: ba6e6ffcbb412697ffb6e9b226ecd3d160e36ad3
plan_head_after: 00d38535990338f60171e5a364e76875ce240487
duration: 16min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 2: Stored Action Confirmation Summary

**Payments and cookie choices now require an informed Polish prompt and locally matched “tak”; the stored action executes once and its effect stays local.**

## Accomplishments

- The content script offers confirmation only for the two confirmable policy rejections. Confirmation bypasses those checks alone; hidden, disabled, sensitive, role, epoch, document and semantic-drift checks still reject. Prompts name the actual DOM control and never echo fill text.
- `confirm_action` stores the original proposal and masked pre-snapshot. A local reply executes that proposal without taking a new snapshot or calling `/api/action` or `/api/effect`. Local navigation handoffs describe the destination. Cancellation, one reprompt, sixty-second expiry and repeated confirmation fail safely.
- Consent detection uses CMP containers and folded dialog labels/text, fails closed on exceptions, and gives consent classification precedence over harmless labels and model flags. All five fixture consent controls require confirmation; “Znajdź” remains safe.
- Browser tests prove one payment, second-“tak” idempotency, reprompt-cancel, reload refusal, expiry and renamed-control refusal with zero chat requests after each prompt. Consent acceptance, cancellation and policy-link navigation have local outcomes.

## Task Commits

| Task | RED | GREEN |
|------|-----|-------|
| 1: Exact stored payment confirmation tracer | `fcac750` | `d2a8fe8` |
| 2: Informed cookie-consent confirmation | `cd6325f` | `3749cf0` |
| 3: Failure paths and ownership | `9b6e1c6` | `00d3853` |

All commits ran repository hooks. No refactor commit was needed and no tracked files were deleted. Six task commits are measured from the persisted ledger; the subsequent summary commit is outside that interval. Realized diff cost is ceil(diff characters / four), on the plan's estimate scale.

## TDD Gate Compliance

Every task established named assertion failures and `RED_EVIDENCE_OK` before production edits:

| Task | RED target | Tests/pass/fail | GREEN |
|------|------------|-----------------|-------|
| 1 | confirmation permits irreversible and model-flagged actions only | 71/66/5 | 136 units |
| 2 | consent container overrides benign labels and known-safe controls | 70/68/2 | 138 units |
| 3 | superseded reply cannot consume the replacement owners confirmation | 99/98/1 | 147 units |

Evidence records and TAP output: `/tmp/02-02-task{1,2,3}-red.{json,log}`. The committed tracer passed its full repeat feedback gate before Task 2.

## Verification

- Final extension suite: **147 passed**, zero failures/skips/todos; typecheck passed.
- DOM checks passed, including all five consent controls, unaffected lookup, masking, native-fill safety and semantic drift.
- Task 1 targeted E2E and repeated tracer gate: **3/3** (confirm, refusals, privacy).
- Task 2 E2E: **4/4** (consent, confirm, navigation, tracking).
- Final full E2E: **11/11** (confirm, consent, effect, navigation, onboarding, privacy, refusals, tracer, tracking, turns, wav).
- Backend: **63 passed**; its pre-existing Starlette/httpx deprecation warning remains outside scope.
- Production build, source/bundle/tracked-file key hygiene, untracked `.env` check and diff whitespace checks passed. Manifest permissions are unchanged.
- All four executor validations receive confirmation options; only the claimed action-confirmation branch sets literal `confirmed: true`.

## Deviations from Plan

**[Rule 1 - Bug] Guarded pending claims against superseded turn ownership.** Task 3 testing showed that an obsolete `runCommand` could remove the replacement owner's confirmation before the execution ownership check. `claimPending(turnId)` now checks ownership inside `runSerial` before reading/removing pending. The retained regression fails without this guard and passes with it (`9b6e1c6`, `00d3853`). No architectural or scope expansion was required. An additional renamed-control browser case proves the planned semantic-drift guarantee.

## Issues Encountered

Sandbox subprocess and git-index restrictions required authorized escalated checks/commits. A nullable array entry in the new regression needed an explicit assertion for TypeScript; the corrected unit/type suite then passed. No packages were added.

## Known Stubs

None introduced. Empty protocol text, test arrays, nullable state and HTML placeholder attributes are intentional values. Existing teammate-owned transcription work remains tracked separately.

## Human Verification Remaining

On Windows with NVDA, a headset and a clean normal Chrome profile, load the built extension and real proxy, then open `https://inpost.pl/sledzenie-przesylek`. Say “kliknij Zaakceptuj wszystko”: hear the exact consent prompt with the uppercase label spoken as words while the modal is open. Say “tak”: hear the click and closed-consent-window result, and verify the banner disappears. In service-worker DevTools Network between prompt and click, only `/api/transcribe` should appear, never `/api/action` or `/api/effect`. On the payment fixture say “kliknij Zapłać”, then “nie”: hear “Anulowałem” and verify no payment. These real-site/screen-reader backstops remain human checks; the orchestrator owns their cross-phase ledger and UAT recording.

## Next Plan Readiness

Plan 02-03 can extend pending routing and `performProposal`. No automated blockers remain. Shared STATE.md, ROADMAP.md and requirement updates belong to the orchestrator; existing planning/runtime edits were preserved.

## Self-Check: PASSED

All three created artifacts and this summary exist. All six task commits resolve in git; the ledger measures six commits across nineteen changed files. All automated verification and task acceptance checks passed.
