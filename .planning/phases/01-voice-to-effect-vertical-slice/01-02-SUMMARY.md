---
phase: 01-voice-to-effect-vertical-slice
plan: 02
subsystem: extension
tags: [typescript, esbuild, chromium, cdp, masking, privacy, accessibility, node-test]
requires: []
provides:
  - Masked plain-data page snapshot and exact model text grammar
  - Fail-closed proposal policy, stale-safe voice turn reducer and Polish speech templates
  - Typed runtime/proxy message contracts and fixed minimal-permission MV3 identity
  - Offline tracking, search and sensitive fixtures with real Chromium CDP verification
affects: [01-03, 01-04, 02-safe-inpost-parcel-tracking]
tech-stack:
  added: [esbuild 0.28.2, typescript 7.0.2, '@types/chrome 0.3.4', '@types/node 26.6.4']
  patterns: [native Node TypeScript tests, masked structure before model text, epoch-bound WeakRef ids, live DOM policy resolution]
key-files:
  created:
    - extension/package.json
    - extension/package-lock.json
    - extension/tsconfig.json
    - extension/src/shared/snapshot-format.ts
    - extension/src/shared/snapshot-format.test.ts
    - extension/src/shared/mask.ts
    - extension/src/shared/mask.test.ts
    - extension/src/shared/validate.ts
    - extension/src/shared/validate.test.ts
    - extension/src/shared/turn.ts
    - extension/src/shared/turn.test.ts
    - extension/src/shared/messages.pl.ts
    - extension/src/shared/messages.pl.test.ts
    - extension/src/shared/protocol.ts
    - extension/src/content/snapshot.ts
    - extension/scripts/gen-key.mjs
    - extension/static/manifest.json
    - extension/e2e/cdp.mjs
    - extension/e2e/dom-check.mjs
    - server/fixtures/tracking-form.html
    - server/fixtures/szukaj.html
    - server/fixtures/sensitive.html
  modified: [.gitignore]
key-decisions:
  - "Recheck live role, accessible name and sensitive-field signals at resolution, alongside connection, visibility, disabled state and epoch."
  - "Check complete numeric secret tokens because invalid PESEL 12345678901 is a prefix of the required visible 24-digit parcel positive control."
patterns-established:
  - "Publish an epoch and WeakRef map only after the complete masked snapshot succeeds."
  - "Hidden descendants are excluded from heading, alert and button text as well as the outer DOM walk."
requirements-completed: [PAGE-01, SAFE-04, ACT-04, VOICE-01]
coverage:
  - id: D1
    description: Checksum scrubbing and field masking preserve 8- and 24-digit parcel strings
    requirement: SAFE-04
    verification:
      - kind: unit
        ref: extension/src/shared/mask.test.ts
        status: pass
      - kind: integration
        ref: "npm --prefix extension run dom-check: sensitive"
        status: pass
    human_judgment: false
  - id: D2
    description: Exact snapshot grammar, visible DOM selection, shadow controls, caps, empty page and immutable DOM
    requirement: PAGE-01
    verification:
      - kind: unit
        ref: extension/src/shared/snapshot-format.test.ts
        status: pass
      - kind: integration
        ref: "npm --prefix extension run dom-check: tracking-form text, invariants, hidden text, cap and empty page"
        status: pass
    human_judgment: false
  - id: D3
    description: Proposal rejections, irreversible policy and live changed-field protection
    requirement: ACT-04
    verification:
      - kind: unit
        ref: extension/src/shared/validate.test.ts
        status: pass
      - kind: integration
        ref: "npm --prefix extension run dom-check: live policy changes and live irreversible name"
        status: pass
    human_judgment: false
  - id: D4
    description: Toggle state reduction preserves busy state and recovers only after 30000 ms
    requirement: VOICE-01
    verification:
      - kind: unit
        ref: extension/src/shared/turn.test.ts
        status: pass
    human_judgment: false
  - id: D5
    description: Exact Polish action, refusal and fallback sentences with Unicode caps
    verification:
      - kind: unit
        ref: extension/src/shared/messages.pl.test.ts
        status: pass
    human_judgment: false
  - id: D6
    description: Fixed minimal-permission manifest, extension-ID vector and delayed tracking fixture
    verification:
      - kind: other
        ref: "manifest/package acceptance and gen-key --id: onfjpfdgmljbggoioddkjgdohdlgdjfm"
        status: pass
      - kind: integration
        ref: "npm --prefix extension run dom-check: tracking-form behavior and szukaj"
        status: pass
    human_judgment: false
actuals:
  tokens: 42767
  tasks: 3
  commits: 5
commits: 5
plan_head_before: 7cc238419bde3a765e490ef857d7186b897de684
plan_head_after: 0b311a870e1a28aad2fabaf2872635190b0f4627
duration: 19min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 2: Safe Extension Foundation Summary

**Masked DOM snapshots, fail-closed proposal decisions and stale-safe voice turns, proven by 66 unit tests and eight real Chromium checks.**

## Performance

- Started: 2026-10-03T13:21:33Z
- Completed: 2026-10-03T13:40:14Z
- Tasks: 3; files in realized pre-summary diff: 25 (including two persisted RED evidence records).
- Actual token estimate: realized diff characters / 4, rounded up = 42,767. Five task commits measured from the persisted plan ledger; close-out metadata commits excluded.

## Accomplishments

- Established an exactly pinned TypeScript/esbuild package with native Node tests and strict typecheck. PESEL, Polish NRB/IBAN and card checksum masking operates on complete string tokens; 40,000 random plain/grouped 24-digit parcel numbers remain unchanged.
- Implemented exact model text formatting, code-point caps, query stripping, placeholder-preferred spoken names, all Polish speech templates, typed messages and the push-to-talk state reducer.
- Implemented local fail-closed validation for every listed reason and irreversible name, with UTF-16 maxlength semantics and stale-state recovery at 30,001 ms.
- Built the DOM walker, accessible-name priority, field-signal masking, visibility filtering, shadow-root traversal, prioritized 250-node cap and epoch-bound WeakRef id map without page attributes or property writes.
- Added tracking/search/payment fixtures and a zero-runtime-dependency CDP harness. Chromium proves native input-event tracking, a visible loader and delayed status result, exact query value, hidden mobile search exclusion and all seven sensitive values replaced at the source.
- Committed the generated public manifest key; extension ID is `onfjpfdgmljbggoioddkjgdohdlgdjfm`. Private key is discarded. Permissions are exactly offscreen/storage/tts.

## Task Commits

1. Task 1 RED: `a4608d0` — masking/format tests and package scaffold. GREEN: `932f343` — checksum scrub and exact model formatter. Eight tests and typecheck passed; tracer feedback rerun passed before Task 2.
2. Task 2 RED: `09de570` — policy, turn and Polish message tests. GREEN: `4ffb4ba` — implementation and typed protocol. 66 tests and typecheck passed.
3. Task 3: `0b311a8` — DOM walker, fixtures, fixed manifest and CDP harness. Eight real Chromium checks passed.

## Verification

- Final `npm --prefix extension test`: **66 passed, 0 failed, 0 skipped**.
- Final `npm --prefix extension run typecheck`: exit 0 with no TypeScript errors.
- Final `npm --prefix extension run dom-check`: **8 PASS** lines; no FAIL lines. Checks: tracking text, invariants, tracking behavior, sensitive masking, search, live policy changes, hidden text/cap/empty page, live irreversible name.
- Server regression `uv run --directory server pytest -q`: **53 passed**, one pre-existing Starlette/httpx deprecation warning. No package substitution was made.
- Package pins and minimal manifest acceptance passed. No runtime dependencies, prohibited permissions or whole-digit numeric conversions in mask.ts; both requested gitignore entries occur once.
- Fixed key ID matches the 32-letter a-p grammar and the shared base64("abc") ID vector. The generated profile and child processes are cleaned up after browser checks.
- All task acceptance criteria were checked, with the impossible secret-prefix assertion corrected as described below. Snapshot HTML is identical before/after; unknown, whitespace-modified and uppercased ids fail exact lookup; stale epoch fails; tracking submit is lookup and payment POST submit is irreversible.

## TDD Gate Compliance

| Task | Intentional RED assertion | Gate | GREEN |
|------|---------------------------|------|-------|
| 1 | Expected `PESEL [ukryte]`, actual `PESEL 44051401359`; missing exact model text also failed | RED_EVIDENCE_OK | 8 tests passed |
| 2 | Expected unknown_action rejection, actual ok/none from API declaration | RED_EVIDENCE_OK | 66 tests passed |

Both RED commits precede their GREEN commits. Records are persisted in `01-02-task1-red.json` and `01-02-task2-red.json`. Minimal API declarations let the RED tests fail on planned behavior rather than imports; none remain as stubs. No separate refactor was needed.

## Decisions Made

Resolve against the live role/name/sensitivity to prevent post-snapshot page mutations bypassing local safety. Numeric secret checks require complete digit tokens rather than substrings of intentionally preserved parcel numbers.

## Deviations from Plan

1. **[Rule 1 - Bug] Contradictory secret-prefix acceptance:** Task 3's literal absence of `12345678901` conflicts with its required presence of `123456789012345678901234`. The browser failure output showed the PESEL field already masked and the required parcel paragraph intact. Check complete numeric-token boundaries and assert all seven protected field values equal `[ukryte]`; all original secrets remain protected (`0b311a8`).
2. **[Rule 2 - Missing Critical] Live role/name/sensitivity recheck:** cached policy properties could allow a search field changed to OTP or a button renamed to Zapłać after the snapshot. Recompute these properties at resolution, retain the cached sensitive flag as a safety floor, and prove hidden/disabled/disconnected/role/sensitivity/name mutations in Chromium (`0b311a8`).
3. **[Rule 2 - Missing Critical] Hidden descendants in aggregated text:** raw heading/alert/button textContent would include hidden nested injection text even if the outer walker skips hidden subtrees. Aggregate only visible descendants; Chromium verifies hidden heading and alert descendants are excluded (`0b311a8`).

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: file_access | extension/e2e/cdp.mjs | Test-only static fixture server reads under its selected root; binds 127.0.0.1, rejects lexical traversal and serves no production API. |

## Issues Encountered

Dependency network access, native Node test workers, Git mutations and Chromium required explicit approved escalation. No sandbox bypass flags were used for Chromium. Initial sandbox Node worker failure was not counted as RED; only the escalated assertion-failure run authorized implementation. The expected esbuild install-script notice and existing server TestClient warning remain as research described.

## Known Stubs / Remaining Verification

No functional stubs, skipped tests or unrun plan verification remain. The manifest is intentionally a build template: plan 01-03 supplies runtime entrypoints and substitutes the proxy origin. This plan does not claim microphone capture, screen-reader speech or live model/Whisper acceptance; those are later runtime/end-of-phase checks. No new human-only check is introduced by this pure foundation slice.

## Next Phase Readiness

Ready for 01-03/01-04 runtime wiring and E2E smoke. Import shared modules using `.ts`; use `cdp.mjs` helpers for browser/process control. The proxy can now derive the fixed extension origin from the manifest and serve the committed fixtures.

Shared requirement IDs remain pending in REQUIREMENTS.md until every sibling plan declaring each ID has a summary; completion of this plan alone does not assert full VOICE-01/PAGE-01/SAFE-04/ACT-04 runtime acceptance.

## Self-Check: PASSED

All 25 realized files exist and all five task commits resolve. Unit/typecheck/browser/server verification and manifest/identity acceptance passed. The summary is committed before state and roadmap advancement.
