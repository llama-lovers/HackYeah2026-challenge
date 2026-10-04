---
phase: 04-audio-control-accessible-settings
plan: 01
subsystem: ui
tags: [chrome-extension, mv3, cancellation, accessibility, tts, aria-live]
requires:
  - phase: 03-page-exploration-conversation
    provides: Document-scoped replay, scrolling and owned conversation output
provides:
  - Urgent stop and discard across worker, recorder and content contexts
  - Generation-fenced output and final action authorization
  - Explicit exclusive speech routing and trusted options recovery
affects: [04-02, 04-03, phase-verification, accessibility-uat]
actuals:
  tokens: 22388
  tasks: 3
  commits: 6
plan_head_before: 93887747c35539f7642663683b2fadfb2756c7bb
plan_head_after: cc2c0e2203376d787a83c19badc3ecbfa5d3d3d5
tech-stack:
  added: []
  patterns: [urgent owner invalidation, cancelable generation queues, selected output router, fixed recovery codes]
key-files:
  created:
    - extension/src/shared/settings.ts
    - extension/src/shared/settings.test.ts
    - extension/src/content/live-region.test.ts
    - extension/e2e/scenarios/cancellation.mjs
  modified:
    - extension/src/background/index.ts
    - extension/src/background/pipeline.ts
    - extension/src/background/pipeline.test.ts
    - extension/src/shared/protocol.ts
    - extension/src/shared/conversation.ts
    - extension/src/shared/messages.pl.ts
    - extension/src/offscreen/offscreen.ts
    - extension/src/content/index.ts
    - extension/src/content/executor.ts
    - extension/src/content/live-region.ts
    - extension/src/options/options.ts
    - extension/static/options.html
    - extension/static/manifest.json
    - extension/e2e/scenarios/conversation.mjs
key-decisions:
  - Preserve normal recording completion with REC_STOP; explicit safety stop uses REC_DISCARD and processing toggle cancels.
  - Default to screen_reader and never infer screen-reader absence from failed page delivery.
  - Browser TTS delivery requires an explicitly selected route, a Polish voice and terminal event before action authorization.
  - Missing page delivery stores a fixed recovery code and focuses the trusted options alert instead of speaking page text through another route.
patterns-established:
  - All worker lines and content pre-actions share deliverOutput ownership and route selection.
  - Cancellation fences are checked after asynchronous delivery and immediately before synchronous DOM effects.
requirements-completed: [SAFE-05, OUT-02]
coverage:
  - id: D1
    description: Urgent keyboard stop discards capture, aborts local requests and suppresses late results; complete spoken stop routes locally after batch STT.
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: extension/src/background/pipeline.test.ts#urgent stop discards processing capture and clears pending ownership
        status: pass
      - kind: unit
        ref: extension/src/background/pipeline.test.ts#complete spoken stop is local while substring dictation reaches the model
        status: pass
      - kind: e2e
        ref: npm --prefix extension run e2e -- cancellation
        status: pass
    human_judgment: false
  - id: D2
    description: Dedicated stop from an internal tab cancels queued announcements and prevents effects before the final commit boundary.
    requirement: SAFE-05
    verification:
      - kind: unit
        ref: extension/src/content/live-region.test.ts#cancelled live queue resolves without writing delayed text
        status: pass
      - kind: e2e
        ref: extension/e2e/scenarios/cancellation.mjs#pre-action-delay-and-final-commit-gates
        status: pass
    human_judgment: false
  - id: D3
    description: Explicit output selection provides exclusive live-region or Polish TTS delivery, terminal action gates, replay fencing and trusted restricted/missing-page recovery.
    requirement: OUT-02
    verification:
      - kind: unit
        ref: extension/src/background/pipeline.test.ts#selected Polish TTS waits for terminal delivery and uses no live-region route
        status: pass
      - kind: unit
        ref: extension/src/background/pipeline.test.ts#default output failure stores fixed recovery and never switches to browser speech
        status: pass
      - kind: e2e
        ref: npm --prefix extension run e2e -- cancellation conversation errors
        status: pass
    human_judgment: false
  - id: D4
    description: Audible screen-reader behavior, native Polish voice quality and keyboard usability of the settings/recovery surface
    requirement: OUT-02
    verification: []
    human_judgment: true
    rationale: Automated tests observe DOM mutations, focus and deterministic TTS events; no human NVDA/VoiceOver or native Polish-voice results were supplied or performed.
duration: 32 min
completed: 2026-10-04
status: complete
---

# Phase 04 Plan 01: Audio Stop and Exclusive Output Summary

**Urgent cross-context capture discard, generation-fenced actions and explicit live-region/Polish TTS routing with trusted options recovery.**

## Performance

- **Duration:** 32 min
- **Started:** 2026-10-04T01:15:08Z
- **Completed:** 2026-10-04T01:46:57Z
- **Tasks:** 3/3
- **Production/test files changed:** 18
- **Actuals:** 22,388 tokens measured as realized diff characters / 4; six task commits measured from the persisted plan ledger before metadata commit.

## Accomplishments

- `handleStop` immediately invalidates output ownership, stops TTS, aborts local requests and sends `REC_DISCARD`; serialized cleanup removes confirmation/effect state and restores idle. Normal recording toggle, silence and duration-cap completion retain `REC_STOP`.
- `stop-listening` works without a useful command tab. Content queues settle cancellation explicitly, and click/fill/scroll authorization obeys generation and document ownership on both sides of asynchronous boundaries.
- Worker errors, statuses, replay, effects and content pre-actions use one selected output router. Default screen-reader delivery never silently calls TTS. Explicit browser voice waits for a terminal event and cancels dependent work on stop, route change or failure.
- Restricted URLs and missing receivers use bounded fixed session recovery codes, a focused trusted options `role=alert` and acknowledgement. The options page includes a labeled mode selector, actual stop shortcut and honest batch spoken-stop latency text.

## Task Commits

Each task followed RED then GREEN, using normal Git commits with hook execution enabled and no bypass:

1. **Task 1: End-to-end stop** — `dc07cc7` (test), `d23b171` (feat).
2. **Task 2: Dedicated shortcut and page fences** — `fc313ed` (test), `6f131df` (feat).
3. **Task 3: Exclusive selected output policy** — `44671de` (test), `cc2c0e2` (feat).

**Plan metadata:** Separate `docs(04-01)` commit containing this summary and the ready requirement update. No STATE.md or ROADMAP.md changes.

## Verification Evidence

- `npm --prefix extension test`: **PASS**, 274 tests, zero failures, zero skips/todos; final suite duration 15,322 ms.
- `npm --prefix extension run typecheck`: **PASS**.
- `npm --prefix extension run build`: **PASS**.
- `npm --prefix extension run e2e -- cancellation conversation errors`: **PASS**, 3/3 scenarios; cancellation 16,834 ms, conversation 113,526 ms, errors 94,319 ms.
- Final expanded `npm --prefix extension run e2e -- cancellation`: **PASS**, 1/1, 16,904 ms; includes removed-receiver recovery and checks no untrusted recovery text or TTS fallback.
- `git diff --check`: **PASS**. Created-file and task-commit checks: **PASS**. No tracked deletions.
- Source scan: one `chrome.tts.speak` call inside the router's TTS adapter; one content live-region mutation entry through owned ANNOUNCE; content pre-actions use typed OUTPUT requests.

Browser checks used official Chrome for Testing 154.0.8037.92 with the existing fake upstream and local proxy. Invocation environment: `CHROMIUM_BIN` pointed to the downloaded test browser under `/tmp/04-01-browser`, and `UV_CACHE_DIR=/tmp/04-01-uv`. No application dependency or lockfile changed.

### Task acceptance gates

| Task | Evidence | Result |
| --- | --- | --- |
| 1 | Held microphone opening releases all tracks with zero uploads; held upload aborts; held model request aborts with zero execution/late answer and no pending state; duplicate stop is safe; complete stop phrases issue no model request; substring dictation reaches model | PASS |
| 2 | Stop command from options/internal context; canceled 60 ms queue resolves canceled with no replay; stop during pre-action delay and held final commit prevents click; already committed click remains one click with no rollback claim | PASS |
| 3 | TTS terminal gate, stop and mode-change cancellation; no page live writes in browser mode; failed/missing Polish voice recovery in units; restricted and removed-receiver focused trusted alerts; replay after successful delivery only; late storage error suppression | PASS |

### TDD Gate Compliance

All three intentional RED records were validated with the installed core's `check tdd-red-evidence`, returning `RED_EVIDENCE_OK`, before their GREEN implementation:

| Task | Target assertion in RED | Exit | Expected / actual | Commits |
| --- | --- | --- | --- | --- |
| 1 | urgent stop discards processing capture and clears pending ownership | 1 | idle / processing | dc07cc7 → d23b171 |
| 2 | cancelled live queue resolves without writing delayed text | 1 | cancelled / undefined | fc313ed → 6f131df |
| 3 | default output failure stores fixed recovery and never switches to browser speech | 1 | no TTS / unselected TTS spoke page text | 44671de → cc2c0e2 |

RED commands respectively used `node --test --test-reporter=tap --test-name-pattern=urgent extension/src/background/pipeline.test.ts`, `node --test extension/src/content/live-region.test.ts`, and `node --test --test-name-pattern=default extension/src/background/pipeline.test.ts`. Evidence records were `/tmp/04-01-red1.json`, `red2.json`, `red3.json`; the substantive assertion evidence is preserved above. No separate refactor was needed.

## Files Created/Modified

- `shared/settings.ts` and test — strict explicit output preference and bounded recovery-code decoder.
- `shared/protocol.ts`, `conversation.ts`, `messages.pl.ts` — stop/discard/output generations, local complete-phrase stop and fixed Polish recovery/latency wording.
- `background/index.ts`, `pipeline.ts`, `pipeline.test.ts` — urgent command dispatch, cancellation ownership, exclusive output seam, replay/terminal gates and error suppression.
- `offscreen/offscreen.ts` — safety discard reuses recorder cleanup and cannot finalize an upload.
- `content/index.ts`, `executor.ts`, `live-region.ts`, `live-region.test.ts` — cancelable page delivery, selected pre-actions and final effect fences.
- `static/manifest.json`, `options.html`, `options/options.ts` — dedicated stop command, actual binding, explicit route control and trusted alert recovery.
- `e2e/scenarios/cancellation.mjs`, `conversation.mjs` — held lifecycle/action/output gates and viewport-independent scrolling verification.

## Decisions Made

Normal recording completion remains distinct from safety discard, as Task 1 explicitly requires. The dedicated shortcut and processing toggle stop immediately; local spoken stop becomes known only after batch transcription. Route selection is explicit, defaults to screen-reader mode and does not detect screen-reader presence. Browser TTS may use a remote Polish voice; this implementation makes no offline claim.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Make the existing scrolling browser check independent of viewport height**
- **Found during:** Task 3 required conversation scenario.
- **Issue:** The test assumed 12 downward steps would reach the end. Chrome for Testing's viewport needed 13; actual scroll was 3960 of 4020 pixels after 12 valid steps.
- **Fix:** Derive the maximum step count from measured document range and viewport step size; retain all movement, boundary, focus and no-provider assertions.
- **Files modified:** `extension/e2e/scenarios/conversation.mjs`.
- **Verification:** Full conversation browser scenario passes.
- **Committed in:** `cc2c0e2`.

**Total deviations:** 1 auto-fixed (Rule 3).
**Impact:** Test portability only; no change to scrolling production behavior or architectural scope. Additional unit test files and shared Polish/protocol changes support the planned behavior and acceptance gates.

## Issues Encountered

The fresh worktree lacked installed extension and server dependencies. Extension checks used a temporary symlink to existing installed dependencies; the symlink was removed before close-out. `uv sync --project server` installed the repository's declared server dependencies into the ignored worktree environment after the browser harness startup timeout exposed the missing environment. Regular Chrome did not load the unpacked extension in this harness; official Chrome for Testing provided the required test surface. A newly added test fixture lacked the required `target: 'sw'` field; typecheck caught it and the fixture was corrected before final verification.

## User Setup Required

None - no new external service configuration.

## Next Phase Readiness

Ready for 04-02 and 04-03. SAFE-05 is ready for requirement tracking; OUT-02 is also declared by 04-03 and remains globally pending until that sibling plan finishes. `requirements-completed` copies this plan's IDs as required and does not claim the whole phase or human acceptance is complete.

Human NVDA/VoiceOver settings, recovery and audible delivery checks, plus target-machine native Polish-voice availability/quality, remain **pending**. Automated fake TTS events do not prove audible playback. Client fetch abort does not prove provider computation/billing stopped. Cancellation after an already committed synchronous DOM effect cannot undo it. Clearing ARIA live nodes cannot guarantee interruption of speech already queued inside a user's screen reader.

No new network, authentication, file-access or schema trust boundary was introduced. No goal-blocking stubs or skipped automated checks remain. The orchestrator owns STATE.md and ROADMAP.md and neither was modified.

## Self-Check: PASSED

All four created artifacts exist. All six task commit hashes exist on this worktree branch. Each task acceptance gate and plan-level automated check passed as listed above. Worktree root/branch guards passed before task commits. Human-dependent deliverables remain classified for human judgment.

---
*Phase: 04-audio-control-accessible-settings*
*Completed: 2026-10-04*
