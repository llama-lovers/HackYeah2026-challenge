---
phase: 02-safe-inpost-parcel-tracking
plan: 03
subsystem: safety
tags: [ambiguity, polish, privacy, captcha, structured-output, tdd]
requires:
  - phase: 02-02
    provides: Exact stored-action confirmation and local confirmed effects
provides:
  - Strict model choose action with locally validated numbered options
  - Duplicate-name guard with heading context and choice-to-confirmation routing
  - Local secret/captcha utterance refusals and blocking-page captcha reporting
affects: [phase-verification, page-exploration]
tech-stack:
  added: []
  patterns: [flat strict option fields, stored snapshot choice replies, pre-egress intent refusals]
key-files:
  created:
    - extension/src/shared/choice.ts
    - extension/src/shared/choice.test.ts
    - extension/e2e/scenarios/choice.mjs
    - extension/e2e/scenarios/secrets.mjs
    - server/fixtures/ambiguous.html
  modified:
    - server/app/schemas.py
    - server/app/prompts.py
    - server/tests/fake_openrouter.py
    - extension/src/background/pipeline.ts
    - extension/src/shared/pending.ts
    - extension/src/shared/intent.ts
    - extension/src/shared/mask.ts
    - extension/src/shared/messages.pl.ts
    - extension/src/content/tracking.ts
    - extension/e2e/dom-check.mjs
key-decisions:
  - "Choice replies execute the stored snapshot epoch, document and selected ID without a new planning request; irreversible choices still require tak."
  - "Secret/captcha utterance refusal precedes pending consumption, preserving an existing dialog while withholding all snapshots and chat requests."
  - "Captcha-labelled targets are refused centrally for model, chosen and confirmed proposals, and before duplicate-name questions."
requirements-completed: [ACT-06, SAFE-03]
coverage:
  - id: D1
    description: Strict choose schema roundtrip and bounded enabled action-compatible options
    requirement: ACT-06
    verification:
      - {kind: integration, ref: "uv run --directory server pytest -q (66 passed)", status: pass}
      - {kind: unit, ref: extension/src/shared/choice.test.ts, status: pass}
    human_judgment: false
  - id: D2
    description: Numbered selection, contextual duplicate guard, one reprompt and irreversible confirmation chain
    requirement: ACT-06
    verification:
      - {kind: unit, ref: extension/src/background/pipeline.test.ts, status: pass}
      - {kind: e2e, ref: extension/e2e/scenarios/choice.mjs, status: pass}
    human_judgment: false
  - id: D3
    description: Secrets and captcha action requests stop locally with a trusted-person suggestion
    requirement: SAFE-03
    verification:
      - {kind: unit, ref: extension/src/shared/intent.test.ts, status: pass}
      - {kind: e2e, ref: extension/e2e/scenarios/secrets.mjs, status: pass}
    human_judgment: false
  - id: D4
    description: Sensitive-field and captcha-target guards plus visible blocking-page captcha explanation
    requirement: SAFE-03
    verification:
      - {kind: unit, ref: extension/src/shared/mask.test.ts, status: pass}
      - {kind: automated_ui, ref: extension/e2e/dom-check.mjs, status: pass}
      - {kind: e2e, ref: extension/e2e/scenarios/refusals.mjs, status: pass}
    human_judgment: false
  - id: D5
    description: NVDA reads the complete Polish list and refusals; real pinned model chooses ambiguous live InPost controls
    verification: []
    human_judgment: true
    rationale: Linux fixture automation cannot establish actual screen-reader speech, real Whisper phrasing or live OpenRouter grammar behavior
actuals:
  tokens: 15758
  tasks: 3
  commits: 6
plan_head_before: e2e03614db4d5bd1ddd8d2d2242e2e0efc1f3fde
plan_head_after: a893c7f8aa601666bf84f8e7dc0b65a92ebbd5c4
duration: 20min
completed: 2026-10-03
status: complete
---

# Phase 2 Plan 3: Numbered Choices and Secret Refusals Summary

**Ambiguous commands offer at most three DOM-named choices; selected deletions still require confirmation, and secrets or captchas receive local Polish refusals before chat requests.**

## Accomplishments

- The proxy owns the flat strict `choose` contract with required `option_1..option_3`, bounded Pydantic ID fields, updated prompt examples and deterministic fake output. Schema roundtrip, overlong IDs and containing-name matches are tested.
- Choice options discard unknown, duplicate, disabled, non-interactive, wrong-role and sensitive fill candidates. Whole-utterance Polish number/ordinal replies select in spoken order. Duplicate names compare with collapsed whitespace and Polish casing while preserving diacritics; distinct nearest headings contextualize otherwise identical names. Four candidates retain three in DOM order and include the model target.
- Asking executes nothing. The answer uses the exact stored epoch/document/ID without a new snapshot or `/api/action`; model confirmation flags survive selection, and `Usuń` transitions to the contextual confirmation from 02-02. One reprompt, cancellation and expiry remain local.
- Secret-request and captcha-request intents precede all snapshot, pending-claim and network work. Requests are refused with reasons and a trusted-person next step, never echoing the secret. Ordinary questions and parcel commands retain their prior routing.
- Sensitive fields now include verification, authorization, confirmation, pickup, access codes and token labels. Captcha names/hints are refused for direct, chosen and stored-confirmed proposals. A missing parcel status reports visible in-viewport captcha widgets; hidden, transparent, offscreen and zero-size widgets do not count.

## Task Commits

| Task | RED | GREEN |
|------|-----|-------|
| 1: Strict choose tracer and local numbered replies | `7fc7925` | `29c7be3` |
| 2: Duplicate-name guard and contextual confirmation | `f4daffb` | `0e55855` |
| 3: Secret and captcha refusal layers | `caf6e98` | `a893c7f` |

All commits ran repository hooks. No refactor commit was needed and no tracked files were deleted. Six task commits are measured from the persisted plan ledger; the later summary/ledger metadata commit is excluded. Actual tokens are ceil(realized implementation/test diff characters / four) across 26 files.

## TDD Gate Compliance

Every task verified intentional named assertions with `check tdd-red-evidence` before GREEN:

| Task | Named RED target | Tests/pass/fail | GREEN |
|------|------------------|-----------------|-------|
| 1 | choice ids retain only enabled interactive action-compatible candidates in offered order | 7/4/3 | 151 units |
| 2 | duplicate guard preserves DOM order includes the target and disambiguates by heading | 38/36/2 | 155 units |
| 3 | secret requests and assignments refuse without classifying ordinary questions as secrets | 58/51/7 | 163 units |

Evidence: `/tmp/02-03-task{1,2,3}-red.{json,log}`, all `RED_EVIDENCE_OK`. Task 1 returned undefined instead of validated IDs; Task 2 had no duplicate guard; Task 3 classified a dictated password as `other`. The committed tracer passed its repeated choice/tracer/effect 3/3 gate before expansion. Additional expiry regression evidence is `/tmp/02-03-expiry-red.log` (one intentional failing assertion before the local fix).

## Verification

- Final `npm --prefix extension test`: **163 passed**, zero failures/skips/todos; typecheck passed.
- `uv run --directory server pytest -q`: **66 passed**. The pre-existing Starlette/httpx deprecation warning remains outside scope.
- Task 1 E2E and repeated tracer feedback gate: **3/3** choice/tracer/effect. Task 2: **3/3** choice/confirm/consent. New secret/refusal scenarios: **2/2**.
- Final full E2E: **13/13** choice, confirm, consent, effect, navigation, onboarding, privacy, refusals, secrets, tracer, tracking, turns, wav.
- DOM check passed all prior safety checks and new captcha checks: six widget selectors, hidden/transparent/offscreen/zero-size negatives, and the missing-status captcha flag.
- Final build, key-hygiene checks, untracked `server/.env` assertion and exact manifest permission check passed. No dependencies were added.
- Plan artifact/reference assertions and `git diff --check` passed. Empty option strings are intentional protocol values, fixture arrays receive real click effects, and HTML placeholders are field hints; no new stubs were found. No security surface outside the planned threat register was introduced.

## Decisions Made

Followed the plan's proxy-owned schema, DOM-only choice names, stored reply and bounded dialog decisions. The captcha guard also lives in `performProposal`, covering selected and stored-confirmed actions without a fresh snapshot. Shared STATE, ROADMAP and REQUIREMENTS updates remain owned by the orchestrator; existing user/runtime edits were preserved.

## Deviations from Plan

**1. [Rule 1 - Bug] Expired numbered choices could fall through to model replanning.**
- Found during final Task 3 safety review; the existing expiry branch recognized only yes/no replies.
- Added a failing pipeline regression and stopped every expired choice reply with `CONFIRM_EXPIRED`, with no snapshot, execution or fetch.
- Files: `extension/src/background/pipeline.ts`, `pipeline.test.ts`; committed in `a893c7f`.

Additional DOM verification covers all captcha selector variants and visibility boundaries, extending the prescribed DOM check without new dependencies or production scope.

## Issues Encountered

- Sandboxed Node workers/subprocesses and uv cache access required authorized escalated verification/commits.
- A missing function-closing brace in Task 2 and a prior test expecting the shorter sensitive-field refusal were corrected before GREEN; required checks then passed.

## Human Verification Remaining

Recorded in WINDOWS entries 8 and 9 (live provider verification also relates to entry 1):

1. On Windows with NVDA and a headset, run the built extension against the proxy. On `/fixtures/sensitive.html`, dictate a made-up password and BLIK code: hear the full refusal and trusted-person suggestion; Network shows no `/api/action`. With the real Whisper seam, repeat using naturally spoken secret phrases.
2. On `/fixtures/ambiguous.html`, say “kliknij Usuń”, “dwa”, “nie”: NVDA reads the complete three-option list with headings, the contextual confirmation and “Anulowałem”. Nothing is deleted.
3. With the pinned real OpenRouter model and a real key on `https://inpost.pl`, use vague commands such as “kliknij logo” and “kliknij pobierz aplikację”. Verify numbered options replace guessing and genuine model `choose` responses pass the new strict schema without `model_invalid_output`.

These are human backstops, not automated successes. No new user configuration is required by this plan.

## Next Phase Readiness

All automated gates are green and ACT-06/SAFE-03 implementations are ready for phase review. NVDA/live-model checks remain end-of-phase verification. The curated refusal vocabulary still needs real transcript review, as flagged in the plan.

## Self-Check: PASSED

All five created implementation/test artifacts and this SUMMARY exist. All six task commits resolve in git. The ledger measures six commits and the documented final checks passed. No task artifacts remain untracked.
