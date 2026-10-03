---
phase: 03-page-exploration-conversation
plan: 03
subsystem: lifecycle
tags: [chrome-mv3, service-worker, chrome-storage, deadline, error-recovery, polish, e2e, cdp]

requires:
  - phase: 03-page-exploration-conversation
    provides: "announce(tabId, text, intent) with replay-excluding status intent, parseConversationCommand, session-backed replay, restartBrowser harness"
  - phase: 01-voice-to-effect-vertical-slice
    provides: "session-backed turn state with immutable id, typed offscreen events, pending navigation effect handoff, fake upstream, e2e harness"
provides:
  - "One absolute processing deadline (WAIT_NOTICE_MS = 8000) set once at the first recording-to-processing transition, persisted in chrome.storage.session, re-armed after a worker wake"
  - "Once-only, serialized wait-notice claim fenced by turn id, tab and phase; answer-output claims suppress a stale notice; the notice is a status line and never the repeat target"
  - "speakTurn: every answer line claims output through the same serialized queue, so a due notice is delivered strictly before an answer or suppressed, never after"
  - "Typed STT/mic failure codes from the offscreen document and classifyFailure for proxy errors: fixed bounded Polish text per category, never raw bodies or exception text"
  - "Runtime decoders decodeProposal, decodeEffect, decodeTranscriptBody: empty or malformed success bodies execute nothing"
  - "Once-only top-level catches at every worker entry point, plus askPending (a question is only asked once its answer can be remembered)"
  - "e2e primitives restartWorker (real ServiceWorker.stopAllWorkers plus wake) next to restartBrowser; lifecycle and errors scenarios"
affects: [04 settings UI and earcons, phase verification, onboarding wording]

actuals:
  tokens: 32900
  tasks: 3
  commits: 3
plan_head_before: 334c457702c3629c7718d31e13167de6a8a666e1
plan_head_after: e38c46b6960cac59af0b880f1d1dc6e92f46c025

tech-stack:
  added: []
  patterns:
    - "Stored absolute deadline plus a disposable in-memory timer: the timer decides when to look, session storage decides whether to speak"
    - "Claim-then-speak: first answer line and the wait notice are claimed in the same serialized queue (outputClaimed / waitNotifiedAt on the turn)"
    - "Classify, then speak a fixed sentence: only a category (FailureKind, SttErrorCode, MicErrorCode) ever reaches speech"
    - "Decode success bodies at the trust boundary; null always means failure and nothing is sent to the page"

key-files:
  created:
    - extension/e2e/scenarios/lifecycle.mjs
    - extension/e2e/scenarios/errors.mjs
    - extension/src/shared/protocol.test.ts
    - extension/src/background/proxy.test.ts
    - .planning/phases/03-page-exploration-conversation/03-ACCEPTANCE.md
  modified:
    - extension/src/shared/turn.ts
    - extension/src/shared/turn.test.ts
    - extension/src/shared/protocol.ts
    - extension/src/shared/messages.pl.ts
    - extension/src/shared/messages.pl.test.ts
    - extension/src/background/pipeline.ts
    - extension/src/background/pipeline.test.ts
    - extension/src/background/proxy.ts
    - extension/src/background/index.ts
    - extension/src/offscreen/offscreen.ts
    - extension/e2e/cdp.mjs
    - extension/e2e/smoke.mjs
    - extension/e2e/scenarios/conversation.mjs
    - extension/e2e/scenarios/refusals.mjs
    - extension/e2e/scenarios/effect.mjs

key-decisions:
  - "The wait clock starts once, when recording becomes processing (user stop or autonomous cap), as an absolute epoch deadline in the session-stored turn; STT, model work and navigation never restart it, and toProcessing keeps an existing deadline"
  - "The notice is due only while the owning turn is processing, not stale, not yet notified and no answer line has been claimed; a stale (over 30 s) turn never gets a late notice"
  - "Wait notice text is exactly 'To trwa dłużej niż zwykle' (no trailing period) and uses the 'status' intent, so it never becomes the replay buffer"
  - "The notice is not bound to a document id: during a legitimate navigation-effect handoff the turn is still owned and the notice may be spoken on the old or new document, once"
  - "Once the transcript is accepted (commandStarted) duplicated or late TRANSCRIPT, TRANSCRIBE_ERROR and MIC_ERROR events are ignored, so they can neither start a second command nor add a second terminal line"
  - "Failures are classified by category only (proxy status and code, exception type); the raw code, status text, body and exception message are never interpolated, spoken or logged"
  - "Uncertain post-action effects admit uncertainty and send the user to a read-only description ('co tu jest'); no message suggests repeating a consequential action"
  - "A confirmation or choice question whose pending state cannot be stored is replaced by a storage failure line instead of being asked"

patterns-established:
  - "speakTurn(turnId, tabId, text, intent) is the only way a turn speaks; it claims output serially before announcing"
  - "Entry points (handleToggle, handleOffscreenMessage, handleReady, expireJob) never reject: a failure is spoken once, through chrome.tts when the page is unreachable"
  - "e2e fault injection happens where the fault really occurs: offscreen fetch and getUserMedia, worker fetch and tab messages"

requirements-completed: [OUT-07, OUT-08, OUT-03, OUT-04, PAGE-02, PAGE-03, ACT-03]

coverage:
  - id: D1
    description: "One absolute eight-second deadline from the first recording-to-processing transition spanning STT, model and navigation; 'To trwa dłużej niż zwykle' is spoken once when the owning turn is still processing, as a status excluded from repeat"
    requirement: OUT-07
    verification:
      - kind: unit
        ref: "extension/src/background/pipeline.test.ts (OUT-07 tests: once-only notice, slow STT plus model, autonomous stop, worker wake, handoff); extension/src/shared/turn.test.ts"
        status: pass
      - kind: e2e
        ref: "npm --prefix extension run e2e -- lifecycle (slowStt, slowSttAndModel, workerRestart with a real worker kill, navigationHandoff)"
        status: pass
    human_judgment: true
    rationale: "Audible timing against a real screen reader and a genuinely slow provider needs the H5 check on the demo machine"
  - id: D2
    description: "Stale, duplicate and adjacent events cannot produce a late or duplicate line: terminal claim suppresses the notice, a due notice precedes the answer, replacement, tab closure and abandonment cancel it, duplicate STT events start one command"
    requirement: OUT-08
    verification:
      - kind: unit
        ref: "extension/src/background/pipeline.test.ts (adjacency, duplicate and late STT events, tab closure and replacement, stale or replaced turn)"
        status: pass
      - kind: e2e
        ref: "npm --prefix extension run e2e -- lifecycle (fastTurn, tabClosure)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Every STT, microphone, network, model, snapshot, element, delivery, storage and uncertain-effect failure is spoken as one fixed bounded Polish line with a concrete next step and the turn returns to idle"
    requirement: OUT-08
    verification:
      - kind: unit
        ref: "extension/src/shared/messages.pl.test.ts (recovery registry); extension/src/background/pipeline.test.ts (OUT-08 tests); extension/src/background/proxy.test.ts"
        status: pass
      - kind: e2e
        ref: "npm --prefix extension run e2e -- errors (about 55 injected cases with canaries)"
        status: pass
    human_judgment: true
    rationale: "Whether the wording is useful and natural when heard through NVDA or VoiceOver needs the H6 check"
  - id: D4
    description: "Empty or malformed STT, proposal and effect success bodies are decoded at the trust boundary and execute nothing; raw provider bodies, exception text and utterances never reach speech or the proxy log"
    requirement: OUT-08
    verification:
      - kind: unit
        ref: "extension/src/shared/protocol.test.ts; extension/src/background/pipeline.test.ts (malformed bodies)"
        status: pass
      - kind: e2e
        ref: "errors scenario: malformed_* bodies with zero EXECUTE and untouched page; canary absent from live log and proxy output (mutation-checked)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Same-profile browser restart keeps only the verbosity enum (no replay, page text or deadline); a real service-worker kill keeps the in-flight deadline and the claimed flag"
    requirement: OUT-04
    verification:
      - kind: e2e
        ref: "lifecycle (browserRestart, workerRestart) and conversation (post-restart session dump)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Real Alt+Shift+A activeTab grant, audible exact repeat twice, real browser-restart preference and live-model Polish quality are recorded as pending acceptance, separate from automation"
    requirement: PAGE-02
    verification: []
    human_judgment: true
    rationale: "A genuine activeTab command gesture, audible screen-reader speech and live-model quality cannot be observed by the fake-provider harness (03-ACCEPTANCE.md H1-H6, four windows ledger entries)"

duration: 37min
completed: 2026-10-03
status: complete
---

# Phase 3 Plan 03: Lifecycle Notice and Failure Recovery Summary

**One absolute eight-second wait deadline that survives worker death and spans STT, model and navigation, plus exhaustive category-only Polish recovery for every failure seam, proven by unit tests and two adversarial browser scenarios.**

## Performance

- **Duration:** 37 min
- **Started:** 2026-10-03T23:12:51Z
- **Completed:** 2026-10-03T23:50:32Z
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files modified:** 20 (5 created)

## Accomplishments
- OUT-07: `processingDeadline` (absolute) is set once when recording turns into processing, including the autonomous recording cap, and stored with the turn. An in-memory timer only decides when to look; the stored state decides whether to speak. `rehydrateWait()` at worker start and any later event of the owning turn re-arm it from the stored deadline, so a killed worker neither loses nor restarts the clock. Notice claim (`waitNotifiedAt`) and the first answer line (`outputClaimed`) go through the same serialized queue, so a due notice is spoken before an answer or suppressed, never after.
- OUT-08: the offscreen document emits only typed codes (`stt_failed`, `stt_timeout`, `stt_invalid`, `not_configured`, `network`, `not_recording`; mic `not_allowed`, `no_device`, `other`), the worker maps proxy errors with `classifyFailure`, and `messages.pl.ts` turns each category into one fixed sentence with a next step. Success bodies are decoded (`decodeProposal`, `decodeEffect`, `decodeTranscriptBody`); anything that does not decode executes nothing. Every entry point has a once-only catch so an async rejection cannot become silence.
- Harness: `restartWorker` kills the real extension service worker with `ServiceWorker.stopAllWorkers` and wakes it from an extension page; `lifecycle` (about 108 s) covers fast, slow-STT, slow-STT-plus-model, tab closure, worker kill, navigation handoff and browser restart; `errors` (about 95 s) injects about 55 failure cases with canary strings and proves no raw text is spoken and nothing reaches the page.
- Tracer gate: after Task 1 the verify chain (unit tests, typecheck, `e2e -- lifecycle`) was green before expansion; a mutation (deadline 20 s) made the scenario fail, and a mutation of `decodeProposal` made `errors` fail.

## Task Commits

1. **Task 1: end-to-end eight-second notice across delayed STT and terminal output** - `c566881` (feat, tracer)
2. **Task 2: complete plain-Polish recovery for every terminal failure seam** - `8a0caa4` (feat)
3. **Task 3: integrated browser proof and end-of-phase acceptance** - `e38c46b` (test)

**Plan metadata:** committed with this SUMMARY (docs).

## Verification

- `uv run --directory server pytest -q`: 144 passed
- `npm --prefix extension test`: 265 passed (was 231); `typecheck` and `build` clean; `dom-check` all PASS
- `CHROMIUM_BIN=/usr/bin/chromium npm --prefix extension run e2e`: 17/17 scenarios including the new `lifecycle` and `errors`, run twice (after Task 2 and after Task 3)

## Files Created/Modified
- `extension/src/shared/turn.ts` - `WAIT_NOTICE_MS`, deadline and once-only fields, `toProcessing`, pure `waitDecision`
- `extension/src/background/pipeline.ts` - wait timers and `fireWait`, `speakTurn` claims, `askPending`, decoders in use, category-only failure speech, entry-point catches
- `extension/src/background/proxy.ts` - `classifyFailure`
- `extension/src/shared/protocol.ts` - typed STT/mic codes, `sttCodeForStatus`, body decoders, `FailureKind`
- `extension/src/shared/messages.pl.ts` - `WAIT_NOTICE`, per-category failure text, next steps added to element rejections and effect-uncertainty lines
- `extension/src/offscreen/offscreen.ts` - typed STT failure mapping and bounded transcript decoding
- `extension/src/background/index.ts` - worker-start rehydration
- `extension/e2e/cdp.mjs`, `extension/e2e/smoke.mjs` - `stopServiceWorker`, `wakeServiceWorker`, `restartWorker`
- `extension/e2e/scenarios/lifecycle.mjs`, `errors.mjs` - new browser scenarios
- `.planning/phases/03-page-exploration-conversation/03-ACCEPTANCE.md` - pending human checks H1-H6 and Phase 1 carry-over P1-P4

## Decisions Made
See key-decisions. The plan's reversible default A6 (absolute deadline from the first processing transition, once-only persisted claim) was adopted unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Duplicate or late STT events could start a second command or add a second error**
- **Found during:** Task 1 (once-only truths)
- **Issue:** Nothing stopped a duplicated TRANSCRIPT event of the owning turn from running the command twice, or a late TRANSCRIBE_ERROR from resetting the turn mid-command.
- **Fix:** `commandStarted` is set serially when the transcript is accepted; later TRANSCRIPT, TRANSCRIBE_ERROR and MIC_ERROR events of that turn are ignored.
- **Files modified:** extension/src/shared/turn.ts, extension/src/background/pipeline.ts
- **Verification:** unit test "duplicate and late STT events start one command and add no error"
- **Committed in:** c566881

**2. [Rule 2 - Missing critical] Element-rejection and effect-uncertainty lines lacked a next step**
- **Found during:** Task 2 (every message names a next action)
- **Issue:** hidden, disabled, role_mismatch, too_long, unknown_action, SNAPSHOT_FAILED, EFFECT_UNKNOWN and effectFallback had no concrete next action; the last two also needed to avoid inviting a blind repeat.
- **Fix:** added next steps (read-only "co tu jest" for uncertain effects); existing exact-string assertions in `pipeline.test.ts`, `messages.pl.test.ts`, `refusals.mjs` and `effect.mjs` were updated, which are outside the plan's files list.
- **Files modified:** extension/src/shared/messages.pl.ts, extension/src/background/pipeline.test.ts, extension/src/shared/messages.pl.test.ts, extension/e2e/scenarios/refusals.mjs, extension/e2e/scenarios/effect.mjs
- **Committed in:** 8a0caa4

**3. [Rule 1 - Bug] Recorder failure was reported as a speech-recognition failure; mic denial lacked an action**
- **Found during:** Task 2
- **Issue:** `recorder.onerror` emitted `stt_failed` ("Nie udało się rozpoznać mowy"), a misleading message; MIC_DENIED said only that settings were opening.
- **Fix:** recorder errors emit `not_recording`; MIC_DENIED adds "Włącz tam mikrofon."; the mic "other" category gets its own line instead of "no microphone".
- **Files modified:** extension/src/offscreen/offscreen.ts, extension/src/shared/messages.pl.ts
- **Committed in:** 8a0caa4

**4. [Rule 3 - Blocking] Offscreen module not importable in tests**
- **Found during:** Task 2
- **Issue:** `sttCodeForStatus` defined in `offscreen.ts` registers chrome listeners on import, so it cannot be unit tested.
- **Fix:** moved it to `shared/protocol.ts` next to the other decoders.
- **Files modified:** extension/src/shared/protocol.ts, extension/src/offscreen/offscreen.ts
- **Committed in:** 8a0caa4

### Files touched beyond the plan's files_modified list
`extension/src/background/index.ts` (worker-start rehydration), `extension/e2e/scenarios/refusals.mjs`, `effect.mjs`, `conversation.mjs`, `extension/src/shared/turn.test.ts`, `messages.pl.test.ts`, new `protocol.test.ts` and `proxy.test.ts`, `.planning/WINDOWS.md` (four unrun-verify entries) and `03-ACCEPTANCE.md`.

**Total deviations:** 4 auto-fixed (1 Rule 1, 2 Rule 2, 1 Rule 3). **Impact:** message wording and defensive guards on code introduced or touched by this plan; no scope creep (no chrome.tts behavior, earcons, settings UI, Phase 2 confirmations or teammate live_tts work).

## Issues Encountered
- The executor's protected-branch guard reports `main` as protected. This plan was dispatched as a sequential executor on `main` (`branching_strategy: none`, as for plans 03-01 and 03-02), so commits were made there as dispatched; nothing was pushed.
- A real worker kill needed no new dependency: `ServiceWorker.stopAllWorkers` through an `about:blank` page session works for extension workers, and a message from the extension's options page wakes the worker again.
- The e2e suite still needs `CHROMIUM_BIN=/usr/bin/chromium` and fixed ports 8788/8799 on this machine; `lifecycle` and `errors` carry their own 360 s and 420 s timeouts and use fresh browsers.

## Known Stubs
None.

## Threat Flags
None beyond the plan's threat model. T-03-12 (absolute persisted deadline, serialized claims, turn/tab/phase fence), T-03-13 (once-only notice, `commandStarted`, cleanup on every exit), T-03-14 (category-only speech; canaries absent from live log and proxy output), T-03-15 (decoders plus zero-EXECUTE proof on malformed bodies), T-03-16 (uncertainty line with read-only next step) and T-03-SC (no package added) are mitigated as described.

## User Setup Required
None.

## Next Phase Readiness
- All Phase 3 requirement IDs (PAGE-02, PAGE-03, ACT-03, OUT-03, OUT-04, OUT-07, OUT-08) have automated proof; the audible, real-shortcut, real-restart and live-model parts remain **pending** in `03-ACCEPTANCE.md` (H1-H6) together with Phase 1's outstanding P1-P4; Phase 1 verification status is unchanged.
- Phase 4 can reuse `announce(..., 'status')`, `speakTurn`, the `FailureKind` and typed-code mapping, and `restartWorker`/`restartBrowser` in new scenarios.
- Known limitation carried over: an ANNOUNCE interrupted by a navigation after the write but before the acknowledgement falls back to `chrome.tts`, so that line may be heard twice. The wait notice is not bound to a document id on purpose (it may be spoken on either side of a handoff, once).

## Self-Check: PASSED
Created files exist (`lifecycle.mjs`, `errors.mjs`, `protocol.test.ts`, `proxy.test.ts`, `03-ACCEPTANCE.md`), commits `c566881`, `8a0caa4`, `e38c46b` are in `git log` (3 commits since `334c457`), and all verification commands above were re-run green after the final commit.
