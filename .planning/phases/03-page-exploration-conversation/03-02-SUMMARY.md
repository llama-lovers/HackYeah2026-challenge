---
phase: 03-page-exploration-conversation
plan: 02
subsystem: conversation
tags: [chrome-mv3, chrome-storage, live-region, fastapi, polish, verbosity, scroll, replay]

requires:
  - phase: 03-page-exploration-conversation
    provides: "/api/explore with verbosity input, ACTION_CAPS 3/4/5, parseExploreCommand, worker pipeline with local routing"
  - phase: 01-voice-to-effect-vertical-slice
    provides: "live-region announcer, session-backed turn state, /api/effect, fake upstream, e2e harness"
provides:
  - "parseConversationCommand: complete-phrase local grammar for repeat, shorter/longer and scroll down/up/top"
  - "ANNOUNCE acknowledged only after the live-region write and naming its document; PING reports docId"
  - "One bounded session-only replay entry {tabId, docId, text}, invalidated on navigation and tab closure"
  - "Persistent concise/standard/detailed verbosity (single validated enum in chrome.storage.local) driving exploration, action caps and effect prompts"
  - "Backward-compatible verbosity field on /api/effect (Pydantic + prompt)"
  - "SCROLL request/result protocol and scrollDocument with measured moved/boundary/unsupported outcome and unchanged focus"
  - "e2e harness restartBrowser (same profile) and conversation scenario"
affects: [03-03 lifecycle and errors, 04 settings UI, onboarding wording]

actuals:
  tokens: 20600
  tasks: 3
  commits: 3
plan_head_before: b303215b6f46fa83b2a107c6db21005da477cf75
plan_head_after: dbc5c11f0c0518e229db7f52f07fca1ded687265

tech-stack:
  added: []
  patterns:
    - "Every spoken line carries an output intent (substantive | status | pre_action | replay); only delivered substantive lines become the replay buffer"
    - "Runtime-decoded storage and message payloads (decodeReplay, decodeVerbosity, decodeScrollRequest, decodeScrollResult) instead of trusting types"
    - "Page-measured results: the worker speaks from the content script's measurement, never from the request"

key-files:
  created:
    - extension/src/shared/conversation.ts
    - extension/src/shared/conversation.test.ts
    - extension/src/content/scroll.ts
    - extension/src/content/scroll.test.ts
    - extension/e2e/scenarios/conversation.mjs
  modified:
    - extension/src/background/pipeline.ts
    - extension/src/background/pipeline.test.ts
    - extension/src/content/index.ts
    - extension/src/shared/protocol.ts
    - extension/src/shared/messages.pl.ts
    - extension/e2e/smoke.mjs
    - server/app/schemas.py
    - server/app/exploration.py
    - server/app/prompts.py
    - server/app/main.py
    - server/tests/fake_openrouter.py
    - server/tests/test_seams.py
    - server/tests/test_exploration.py

key-decisions:
  - "Conversation commands are matched as complete normalized phrases (case, diacritics, punctuation, spacing folded) before any pending interaction is claimed, so 'powtorz' can repeat a confirmation question without consuming it"
  - "Replay buffer is ONE entry, written only after the page acknowledged the live-region write and keyed by tab and document id; an unstorable (oversized) message clears the buffer instead of leaving a stale older response"
  - "Verbosity, scroll, no-message and persistence-failure acknowledgements are 'status' lines and never replace the replayed response; pre-command errors (mic, STT, nothing heard, cancelled, reprompts) are also status"
  - "Storage failure keeps the prior effective level and says so; the new level is announced only after chrome.storage.local.set succeeded; the sole durable value is the enum"
  - "Scroll steps 0.8 viewport with behavior 'instant'; within one pixel of an end counts as the end (boundary), and a document with no scroll range or content in a nested scroller is reported as unsupported with a next step"
  - "Effect prompt keeps every level at one or two sentences and states that a shorter level never drops an error or its next step; the verbosity tag is fenced like all other prompt data"

patterns-established:
  - "announce(tabId, text, intent) is the single speaking seam; default intent is substantive"
  - "Scenario-level restartBrowser keeps durable extension storage and drops session storage, usable by later plans"

requirements-completed: [OUT-03, OUT-04, ACT-03]

coverage:
  - id: D1
    description: "'powtorz' replays the exact Unicode text of the last delivered substantive message of the current tab/document through a fresh live-region mutation, with no model or page-action request; empty state says a fixed Polish recovery"
    requirement: OUT-03
    verification:
      - kind: unit
        ref: "extension/src/background/pipeline.test.ts (replay tests); extension/src/shared/conversation.test.ts"
        status: pass
      - kind: e2e
        ref: "npm --prefix extension run e2e -- conversation (replayScenario)"
        status: pass
    human_judgment: true
    rationale: "A DOM write is acknowledged, not audible delivery; whether a screen reader actually re-speaks identical text needs an NVDA/VoiceOver check"
  - id: D2
    description: "Replay data is bounded, session-only, tab/document scoped and invalidated on navigation, tab closure and browser restart; routine lines and replay never replace it"
    requirement: OUT-03
    verification:
      - kind: unit
        ref: "extension/src/background/pipeline.test.ts (scoping, bounded, status-never-replaces tests)"
        status: pass
      - kind: e2e
        ref: "conversation scenario: reload, tab close, same-profile restart, durable storage dump"
        status: pass
    human_judgment: false
  - id: D3
    description: "'krocej'/'dokladniej' move one of concise/standard/detailed per command, saturate, persist only the validated enum and survive a same-profile restart; success announced only after the write; failed or malformed storage handled"
    requirement: OUT-04
    verification:
      - kind: unit
        ref: "extension/src/shared/conversation.test.ts; extension/src/background/pipeline.test.ts (verbosity tests)"
        status: pass
      - kind: e2e
        ref: "conversation scenario (verbosityScenario: all transitions, malformed data, failed write, restart)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Verbosity changes exploration detail (summary sentences, action caps 3/4/5) and the effect-summary prompt while every summary stays one or two sentences and every refusal/recovery keeps its next step"
    requirement: OUT-04
    verification:
      - kind: unit
        ref: "server/tests/test_seams.py (effect verbosity); server/tests/test_exploration.py; extension pipeline.test.ts (caps, effect body, recovery text)"
        status: pass
      - kind: e2e
        ref: "conversation scenario: per-tier explore and effect requests and spoken output against the fake provider"
        status: pass
    human_judgment: true
    rationale: "Real-model Polish quality at each tier, and that the concise tier never reads as dropping a safety clause, needs a human check; the deterministic fake only proves the contract"
  - id: D5
    description: "Voice scroll down/up/top moves the top-level document by a measured amount, preserves focus, reports boundaries and unsupported pages truthfully and never calls the model or the action pipeline"
    requirement: ACT-03
    verification:
      - kind: unit
        ref: "extension/src/content/scroll.test.ts; extension/src/background/pipeline.test.ts (scroll tests); conversation.test.ts (decoders, aliases)"
        status: pass
      - kind: e2e
        ref: "conversation scenario (scrollScenario: clamping, boundaries, focus, nested scroller, dictation routing, zero proxy calls)"
        status: pass
    human_judgment: true
    rationale: "Behaviour on the real inpost.pl layout and how the 'Przewijam.' plus result pair sounds in a screen reader are not covered by the fixture pages"

duration: 31min
completed: 2026-10-04
status: complete
---

# Phase 3 Plan 02: Conversation Controls Summary

**Local complete-phrase commands for exact session-scoped repeat, a persistent three-level verbosity that steers exploration and effect summaries, and measured document scrolling, all without extra model calls.**

## Performance

- **Duration:** 31 min
- **Started:** 2026-10-03T22:36:31Z
- **Completed:** 2026-10-03T23:07:01Z
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files modified:** 18 (5 created)

## Accomplishments
- OUT-03: `powtórz` and its allowlisted variants replay the exact text of the last substantive message that the page acknowledged as written, through a new live-region mutation. The replay entry is one `{tabId, docId, text}` record in `chrome.storage.session`, cleared on READY of a new document and on tab removal, and decoded with exact keys and a 2000-character bound on read. With nothing to replay, a fixed Polish recovery with a next step is spoken and nothing is requested.
- OUT-04: `krócej` and `dokładniej` move one step through concise, standard and detailed, saturating at the ends, awaiting `chrome.storage.local.set` before announcing the new level. Absent or malformed storage means standard. The level reaches `/api/explore` and the action cap (3/4/5) and a new backward-compatible `verbosity` field on `/api/effect` with prompt guidance that never drops an error or its next step.
- ACT-03: `przewiń w dół`, `w górę`, `na górę` and their aliases send a typed SCROLL request bound to turn, tab, document and frame 0. The content script announces `Przewijam.`, scrolls the document by 0.8 viewport (or to zero) with `behavior: 'instant'`, measures `scrollY` again, restores focus if a page script stole it and returns moved, boundary or unsupported. The worker speaks from that measurement.
- Tracer gate: after the Task 1 commit the verify chain (unit tests, typecheck, `e2e -- conversation`, then the full e2e run) was re-run green before expansion.

## Task Commits

1. **Task 1: end-to-end exact repeat after a delivered page summary** - `58decab` (feat, tracer)
2. **Task 2: persistent three-level verbosity across exploration and effects** - `f59cc4e` (feat)
3. **Task 3: voice scroll down, up and top with measured truthful results** - `dbc5c11` (feat)

**Plan metadata:** committed with this SUMMARY (docs).

## Verification

- `uv run --directory server pytest -q`: 144 passed (was 136)
- `npm --prefix extension test`: 231 passed (was 191); `typecheck` and `build` clean
- `CHROMIUM_BIN=/usr/bin/chromium npm --prefix extension run e2e`: 15/15 scenarios including `conversation` (about 108 s) and the unchanged `exploration`, `effect` and `turns`; `dom-check` all PASS

## Files Created/Modified
- `extension/src/shared/conversation.ts` - phrase grammar, output intents, replay entry encode/decode, verbosity decode/move
- `extension/src/content/scroll.ts` - `scrollDocument` with measured outcome and focus preservation
- `extension/src/background/pipeline.ts` - intent-aware `announce`, `runRepeat`, `runVerbosity`, `runScroll`, replay invalidation, stored verbosity in explore/effect requests
- `extension/src/content/index.ts` - ANNOUNCE ack after the write, PING docId, validated SCROLL handler
- `extension/src/shared/protocol.ts` / `messages.pl.ts` - SCROLL types and decoders, session/local keys, Polish messages
- `server/app/schemas.py`, `prompts.py`, `main.py`, `exploration.py` - shared `Verbosity`, effect request field and prompt
- `extension/e2e/scenarios/conversation.mjs`, `extension/e2e/smoke.mjs` - browser coverage and `restartBrowser`

## Decisions Made
See key-decisions. Reversible defaults from the plan (A2, A4, A5, A1) were adopted unchanged: complete-phrase matching, replay of the last substantive delivered message, standard default with saturating steps and caps 3/4/5, and a 0.8-viewport document scroll with an honest limitation message for nested scrollers.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] One-pixel nudge at the end of the page was announced as movement**
- **Found during:** Task 3 (first e2e run)
- **Issue:** From 1 px short of the bottom a further "down" moved 1 px and was spoken as "Przewinąłem w dół", although the user was already at the end.
- **Fix:** Within one pixel of an end counts as the end (boundary); two or more pixels still move and the speech adds that the end was reached. Unit test updated.
- **Files modified:** extension/src/content/scroll.ts, extension/src/content/scroll.test.ts
- **Committed in:** dbc5c11

**2. [Rule 3 - Blocking] e2e harness could not restart on the same profile**
- **Found during:** Task 2
- **Issue:** The "remains selected after a same-profile browser restart" truth needs a restart helper; the harness only created fresh profiles.
- **Fix:** `restartBrowser` in `extension/e2e/smoke.mjs` (closes the browser, removes the stale DevToolsActivePort, relaunches on the same profile, wakes and re-attaches the service worker). The conversation scenario performs the restart assertions itself instead of deferring them.
- **Files modified:** extension/e2e/smoke.mjs
- **Committed in:** f59cc4e

**3. [Rule 2 - Missing critical] Fake provider and server tests for the new contract**
- **Found during:** Task 2
- **Issue:** The fake upstream ignored verbosity, so tier behavior could not be compared, and the effect contract change had no server tests (invalid or markup-bearing values, default, prompt carries the level and the "never drop an error" clause).
- **Fix:** Tier-aware fake replies (concise summary is one sentence, effect text differs per level, defaults to standard when the tag is absent) and new tests in `server/tests/test_seams.py` and `test_exploration.py`.
- **Files modified:** server/tests/fake_openrouter.py, server/tests/test_seams.py, server/tests/test_exploration.py
- **Committed in:** f59cc4e

### Files touched beyond the plan's files_modified list
`extension/src/shared/conversation.test.ts`, `extension/src/content/scroll.test.ts`, `extension/src/shared/messages.pl.ts`, `extension/e2e/smoke.mjs`, `server/app/main.py`, `server/tests/*` as above. `extension/src/background/index.ts` was not needed.

**Total deviations:** 3 auto-fixed (1 Rule 1, 1 Rule 2, 1 Rule 3). **Impact:** test and harness support plus one correctness fix in new code; no scope creep.

## Issues Encountered
- A first e2e attempt of the scroll scenario timed out because a short fixture page is still programmatically scrollable when only `overflow:hidden` is set. The "cannot scroll" and "nested scroller" cases now fit the document to the viewport first (`html`/`body` height 100 percent, overflow hidden), which is also what a real single-surface app looks like.
- The e2e uses fixed ports 8788/8799 and needs `CHROMIUM_BIN=/usr/bin/chromium`; the conversation scenario takes about 108 s, so it carries its own 420 s timeout.
- Because the browser is shared between scenarios, the conversation scenario removes the stored verbosity in a `finally` so later scenarios still see the standard level.

## Known Stubs
None.

## Threat Flags
None beyond the plan's threat model. T-03-07 (replay stored only after delivery ack, session-only, scoped, invalidated), T-03-08 (exact enum, only successful writes announced, nothing page-derived in local storage, asserted by the e2e storage dump), T-03-09 (SCROLL decoded, sender without tab, top frame, docId checked, result decoded with echoed docId), T-03-10 (complete phrases only, verified for embedded scroll/repeat/verbosity words), T-03-11 (2000 character bound, replay never self-saves) and T-03-SC (no package added) are mitigated as described.

## User Setup Required
None.

## Next Phase Readiness
- Plan 03-03 can build the eight-second notice and lifecycle errors on `announce(..., intent)`: the notice should be a `status` intent so it does not replace the replay buffer.
- Phase 4 settings UI can read and write the same `verbosity` key in `chrome.storage.local` (enum only).
- Human checks still pending: NVDA/VoiceOver confirmation that identical replayed text is spoken again and how `Przewijam.` plus the result sounds; real inpost.pl scrolling; real-model quality at each verbosity tier; an ANNOUNCE ack proves the DOM write, not audible delivery.
- Known limitation: an ANNOUNCE interrupted by a navigation after the write but before the ack falls back to `chrome.tts`, so that line may be heard twice.

## Self-Check: PASSED
Created files exist (`conversation.ts`, `conversation.test.ts`, `scroll.ts`, `scroll.test.ts`, `conversation.mjs`), commits `58decab`, `f59cc4e`, `dbc5c11` are in `git log` (3 commits since `b303215`), and all verification commands above were re-run green after the final commit.
