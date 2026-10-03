---
phase: 03-page-exploration-conversation
plan: 01
subsystem: api
tags: [chrome-mv3, activeTab, scripting, fastapi, openrouter, read-only-exploration, polish]

requires:
  - phase: 01-voice-to-effect-vertical-slice
    provides: masked snapshot, action validator, worker pipeline, live-region announcer, proxy and fake upstream
provides:
  - POST /api/explore read-only proxy route (summary and actions modes, strict schemas)
  - Local routing of "co tu jest?" and "co mogę zrobić?" before the action route
  - preparePageAccess: ping, inject packaged content bundle into frame 0, ping, on explicit command only
  - candidateKind shared eligibility policy and CANDIDATES / RECHECK_CANDIDATES content messages
affects: [03-02 conversation, 03-03 lifecycle and errors, verbosity tiers, repeat]

actuals:
  tokens: 56000
  tasks: 3
  commits: 3
plan_head_before: 863fb204c5d970f91aa029c827d0cdbd036e153b
plan_head_after: dbb40cddc5a1c28c2d0545e11b5e9f80c4c4f227

tech-stack:
  added: []
  patterns:
    - "Read-only model route: model returns descriptions or candidate ids, extension re-validates and renders locally"
    - "Runtime decoding of proxy bodies (decodeSummary, decodeActions, decodeRecheck) instead of trusting typed fetch"
    - "Candidate eligibility extracted from validateProposal (targetRejection, clickNeedsConfirmation, candidateKind)"

key-files:
  created:
    - server/app/exploration.py
    - server/tests/test_exploration.py
    - extension/src/shared/exploration.ts
    - extension/src/shared/exploration.test.ts
    - extension/src/content/candidates.ts
    - extension/e2e/scenarios/exploration.mjs
    - extension/e2e/manifest.test.mjs
  modified:
    - server/app/main.py
    - server/app/config.py
    - server/tests/fake_openrouter.py
    - extension/src/background/pipeline.ts
    - extension/src/background/pipeline.test.ts
    - extension/src/background/proxy.ts
    - extension/src/content/index.ts
    - extension/src/shared/protocol.ts
    - extension/src/shared/validate.ts
    - extension/src/shared/validate.test.ts
    - extension/src/shared/messages.pl.ts
    - extension/static/manifest.json
    - extension/e2e/scenarios/turns.mjs

key-decisions:
  - "Exploration has its own strict route and schema; the click/fill/none action vocabulary and Phase 1 executor are untouched"
  - "Server rejects (502 model_invalid_output) summaries that are not 1-2 complete sentences and action lists that are not a unique in-cap subset of offered ids; the extension decodes again and rejects whole"
  - "Page staleness during the model call is judged by document id, snapshot epoch and live policy recheck without taking a new snapshot"
  - "Phrases 'opisz stronę' deliberately stay on the Phase 1 action route (an existing test depends on it)"
  - "Candidate projection has a 1.5 s budget and a 40-candidate cap; exceeding either marks the list incomplete and the wording avoids claiming absence"

patterns-established:
  - "FAKE-MODEL:<kind> markers in page text steer the fake provider into deliberately invalid output for e2e"
  - "e2e scenarios wrap chrome.tabs.sendMessage in the worker to prove no EXECUTE was sent"

requirements-completed: [PAGE-02, PAGE-03]

coverage:
  - id: D1
    description: "'co tu jest?' returns one or two complete Polish sentences from the masked snapshot through /api/explore, with malformed output turned into a fixed recovery"
    requirement: PAGE-02
    verification:
      - kind: unit
        ref: "server/tests/test_exploration.py; extension/src/shared/exploration.test.ts; extension/src/background/pipeline.test.ts"
        status: pass
      - kind: e2e
        ref: "npm --prefix extension run e2e -- exploration (summaryScenario)"
        status: pass
    human_judgment: true
    rationale: "Usefulness and naturalness of real-model Polish summaries cannot be asserted with the deterministic fake provider"
  - id: D2
    description: "'co mogę zrobić?' lists at most four (standard tier) locally eligible, fresh, de-duplicated actions rendered locally; sparse and empty pages stay truthful"
    requirement: PAGE-03
    verification:
      - kind: unit
        ref: "extension/src/shared/validate.test.ts; extension/src/shared/exploration.test.ts; extension/src/background/pipeline.test.ts"
        status: pass
      - kind: e2e
        ref: "npm --prefix extension run e2e -- exploration (actionsScenario)"
        status: pass
    human_judgment: true
    rationale: "Whether the suggested actions are understandable and really available needs a human check on real sites"
  - id: D3
    description: "Exploration never executes, queues or authorizes a page mutation and never sends sensitive canaries to the provider"
    verification:
      - kind: e2e
        ref: "exploration scenario: no EXECUTE, no action_proposal, DOM and clicks unchanged, secret canaries absent from upstream"
        status: pass
    human_judgment: false
  - id: D4
    description: "Temporary access: activeTab and scripting, ping/inject/ping from the explicit command on ordinary top-level HTTP(S) pages; restricted pages get Polish recovery before recording"
    verification:
      - kind: unit
        ref: "extension/src/background/pipeline.test.ts (restricted, already initialized, inject once, rejected injection); extension/e2e/manifest.test.mjs"
        status: pass
      - kind: e2e
        ref: "exploration scenario accessScenario (host-permission orchestration only)"
        status: pass
    human_judgment: true
    rationale: "The e2e uses a host-permission page and a test hook; a genuine activeTab grant from a real keyboard command needs the human check"

duration: ~2h (interrupted once by an API rate limit)
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 01: Page Exploration Summary

**Read-only "co tu jest?" and "co mogę zrobić?" through a dedicated /api/explore route with local policy-validated candidates and user-invoked activeTab injection on ordinary HTTP(S) pages.**

## Performance

- **Duration:** about 2 h wall time, including a rate-limit pause
- **Completed:** 2026-10-04
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files modified:** 20 (7 created)

## Accomplishments
- PAGE-02: complete phrases such as "co tu jest?" are routed locally before the action route. The proxy returns one or two whole Polish sentences, validated by Pydantic and again by a runtime decoder in the worker. Empty, null, extra-field, excessive and cut-off output becomes a fixed Polish recovery.
- PAGE-03: the content script projects locally eligible controls with the same live policy as the executor (disabled, hidden, sensitive, irreversible, consent, unknown-safety, captcha and duplicate controls excluded). The model only ranks them. The reply must be a unique in-cap subset, is rechecked for document id, epoch and policy after the reply, and is rendered from local role and name data.
- Temporary access: activeTab and scripting added with the proxy-only persistent host permission kept. Restricted, missing and malformed URLs and rejected injection are explained before any recording.
- Tracer gate: the Task 1 verify command was re-run after the commit and passed before expansion ("Tracer verified end-to-end").

## Task Commits

1. **Task 1: read-only page summary through /api/explore** - `aaa15f6` (feat, tracer)
2. **Task 2: user-invoked temporary access on ordinary HTTP(S) pages** - `464dec4` (feat)
3. **Task 3: bounded, locally validated action list** - `dbb40cd` (feat)

## Verification

- `uv run --directory server pytest -q`: 105 passed
- `npm --prefix extension test`: 191 passed
- `npm --prefix extension run typecheck` and `build`: clean
- `CHROMIUM_BIN=/usr/bin/chromium npm --prefix extension run e2e`: 14/14 scenarios (exploration stable across 4 consecutive runs); `dom-check` all PASS

## Decisions Made
See key-decisions. Standard tier requests at most four items, inside the required three to five; concise (3) and detailed (5) caps are already accepted by the route for Plan 03-02.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing tests and e2e assumed InPost-only access**
- **Found during:** Task 2
- **Issue:** Pipeline unit tests passed tabs without a URL, and the `turns` e2e asserted the obsolete "Agent działa na razie tylko na stronie InPost." message for about:blank. Both contradict the plan's missing-URL and restricted-page recovery.
- **Fix:** Added `url` to the test tabs, updated the `turns` scenario to the new Polish recovery text, removed the unused ONLY_INPOST constant.
- **Files modified:** extension/src/background/pipeline.test.ts, extension/e2e/scenarios/turns.mjs, extension/src/shared/messages.pl.ts
- **Committed in:** 464dec4

**2. [Rule 3 - Blocking] "opisz stronę" kept on the action route**
- **Found during:** Task 1
- **Issue:** An existing Phase 1 test relies on "opisz stronę" reaching /api/action, so it cannot join the local summary phrases.
- **Fix:** Summary phrases limited to the "co tu jest" family; documented in exploration.test.ts.
- **Committed in:** aaa15f6

### Files touched beyond the plan's files_modified list
Small, necessary additions: `server/app/config.py` (explore_max_tokens), `extension/src/shared/exploration.ts` and its test (new shared module so Plan 03-02's conversation.ts does not collide), `extension/src/content/candidates.ts`, `server/tests/test_exploration.py`, `extension/e2e/manifest.test.mjs`, `extension/e2e/scenarios/turns.mjs`, `extension/src/shared/messages.pl.ts`, `extension/src/shared/validate.test.ts`.

**Total deviations:** 2 auto-fixed (both Rule 3). **Impact:** test and wording alignment only; no scope creep.

## Issues Encountered
- The e2e runner needs `CHROMIUM_BIN=/usr/bin/chromium` on this machine; without it the browser is not found.
- A fresh service-worker target can briefly lack the `chrome` global; the scenario waits for it before wrapping APIs.
- The e2e uses fixed ports 8788 and 8799, so it cannot run concurrently with another e2e run.
- The warm-up call was not extended to the new schema because an existing test pins warm-up to exactly two requests; first-request schema compile latency for `page_exploration` remains. Candidate for a follow-up.

## Known Stubs
None.

## Threat Flags
None beyond the plan's threat model. T-03-01 to T-03-05 are mitigated as described in the plan (dedicated read-only schema, fenced page data, candidate subset plus recheck, explicit-command access, bounded arrays). The prohibition on mutation from exploration is verified by e2e (no EXECUTE, no action request, DOM and click log unchanged).

## User Setup Required
None.

## Next Phase Readiness
- Plan 03-02 can reuse `parseExploreCommand`, `ACTION_CAPS` and the route's `verbosity` field; the extension currently always sends `standard`.
- Human checks still pending: a real keyboard command grant of activeTab on an ordinary site, real-model summary quality, and NVDA/VoiceOver listening.
- OPTIONS_MIC_GRANTED still mentions InPost only; not changed (outside this plan).

## Self-Check: PASSED
Created files exist, commits `aaa15f6`, `464dec4`, `dbb40cd` are in `git log`, and all verification commands above were re-run green after the final commit.
