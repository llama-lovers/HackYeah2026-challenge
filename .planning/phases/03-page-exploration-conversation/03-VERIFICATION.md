---
phase: 03-page-exploration-conversation
verified: 2026-10-04T02:30:00Z
status: human_needed
score: 4/4 roadmap success criteria verified in code and automated tests (human-only runtime checks pending)
covered_files:
  - .planning/phases/03-page-exploration-conversation/03-01-PLAN.md
  - .planning/phases/03-page-exploration-conversation/03-01-SUMMARY.md
  - .planning/phases/03-page-exploration-conversation/03-02-PLAN.md
  - .planning/phases/03-page-exploration-conversation/03-02-SUMMARY.md
  - .planning/phases/03-page-exploration-conversation/03-03-PLAN.md
  - .planning/phases/03-page-exploration-conversation/03-03-SUMMARY.md
  - extension/src/background/pipeline.ts
  - extension/src/content/candidates.ts
  - extension/src/content/index.ts
  - extension/src/content/scroll.ts
  - extension/src/shared/conversation.ts
  - extension/src/shared/exploration.ts
  - extension/src/shared/messages.pl.ts
  - extension/src/shared/turn.ts
  - extension/static/manifest.json
  - server/app/exploration.py
  - server/app/main.py
covered_digest: "v2:sha256:ef312c2c0f4ce9e9d81fee0f04c774960aa3c654532d9fb5e1fa2831e98ffb01"
behavior_unverified: 0
overrides_applied: 0
re_verification: false
gaps: []
flagged_prohibitions:
  - statement: "MUST NOT remove a safety refusal or recovery next step when applying a shorter verbosity level (judgment-tier)."
    status: "unverified-prohibition - human review recommended (covered by H4)"
warnings:
  - id: WR-01
    summary: "Closing the tab during recording leaves the mic open and still uploads audio (no REC_CANCEL)."
  - id: WR-02
    summary: "page_exploration schema is not in warm_up(); first live 'co tu jest?' pays grammar-compile latency."
  - id: WR-03
    summary: "fence() only neutralizes exact lowercase closing tags; case/whitespace variants bypass the untrusted-data fence."
  - id: WR-04
    summary: "15 s pending-effect expiry timer is in-memory only; a worker kill in that window can leave silence until stale recovery."
human_verification:
  - test: "H1 exact repeat audibly spoken (OUT-03)"
    expected: "'co tu jest?' then 'powtórz' twice: the same answer is heard three times through the screen reader, no chrome.tts voice."
    why_human: "Audible screen-reader delivery of a live-region mutation cannot be observed headlessly."
  - test: "H2 real Alt+Shift+A grants activeTab on an ordinary HTTPS page (PAGE-02, PAGE-03)"
    expected: "Ordinary page: recording starts, answer spoken. chrome:// page and Web Store: 'Tej strony nie obsługuję...' and no recording."
    why_human: "A genuine keyboard-command activeTab grant cannot be reproduced by the automated harness."
  - test: "H3 verbosity survives a real browser restart (OUT-04)"
    expected: "After quitting and restarting the whole browser with the same profile the chosen level still applies, and 'powtórz' says there is nothing to repeat."
    why_human: "Automated e2e restarts a headless Chromium with the same profile directory (passes); a real desktop browser restart is human-only."
  - test: "H4 live-model Polish quality (PAGE-02, PAGE-03, OUT-04)"
    expected: "Summaries grounded; action lists only controls that exist and within 3/4/5; concise level never reads as dropping a warning."
    why_human: "Fake provider in tests; quality of real model output is subjective. Also covers the judgment-tier prohibition."
  - test: "H5 eight-second notice in a genuinely slow turn (OUT-07)"
    expected: "'To trwa dłużej niż zwykle' heard once about 8 s after stop; 'powtórz' repeats the answer, not the notice."
    why_human: "Real latency and audible timing."
  - test: "H6 audible error recovery (OUT-08)"
    expected: "Proxy stopped, mic covered, no API key: each gives short Polish with a next step, never silence."
    why_human: "Audible output and real device/network failure."
---

# Phase 3: Page Exploration & Conversation Verification Report

**Phase Goal:** The user can find their way around any page by voice and steer the conversation: hear what is on the page and what they can do, scroll, ask for a repeat, change how much the agent says, and never be left in silence.
**Verified:** 2026-10-04
**Status:** human_needed
**Re-verification:** No - initial verification

All four ROADMAP success criteria are implemented, wired end to end and covered by passing automated tests. No FAILED truths. The phase is `human_needed` because the six human-only checks (H1-H6, listed in 03-ACCEPTANCE.md as pending) have not been observed, and four non-blocking review warnings remain open.

## Evidence run (own process, not SUMMARY claims)

| Check | Command | Result |
|---|---|---|
| Extension unit tests | `npm --prefix extension test` | 265 pass, 0 fail |
| Typecheck | `npx tsc --noEmit` (extension) | clean |
| Server tests | `uv run --directory server pytest -q` | 144 passed |
| Build | `npm --prefix extension run build` | OK |
| e2e (headless Chromium) | `CHROMIUM_BIN=/usr/bin/chromium npm --prefix extension run e2e` | PASS captcha, choice, confirm, consent, conversation, effect, errors, exploration, lifecycle, navigation, onboarding, privacy, refusals, tracer, tracking, turns; `wav` run separately: PASS (17/17; the full run hit my 550 s wrapper timeout only before the last, alphabetically final, scenario) |
| Debt markers | grep TODO/FIXME/XXX/TBD in `extension/src`, `server/app` | none |

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1a | "co tu jest?" gives a 1-2 sentence page summary | VERIFIED | `parseExploreCommand` (exploration.ts) whole-phrase match; `runSummary` (pipeline.ts:357) takes a masked snapshot, POSTs `/api/explore` mode `summary`; `decodeSummary` rejects 0 or >2 sentences, non-terminal/cut-off, newline, >300 chars; server `validate_exploration_output` enforces same (exploration.py). e2e `exploration` PASS (asserts request, no `action_proposal`). |
| 1b | "co mogę zrobić?" lists at most 3-5 actions | VERIFIED | `runActions` (pipeline.ts:376): content `CANDIDATES` projects only locally eligible controls (`candidateKind`, captcha-filtered, de-duplicated, max 40); model only ranks ids; `decodeActions` rejects non-subset, duplicates, count above `ACTION_CAPS` 3/4/5; `RECHECK_CANDIDATES` re-judges against live page; spoken text is rendered locally from role+name (`actionsList`), model text never spoken. Sparse pages report real count / `NO_ACTIONS`. e2e `exploration` PASS (includes page mutation during model wait -> `ACTIONS_CHANGED`). |
| 2 | User can scroll down, up, to top by voice and hears the result | VERIFIED | `parseConversationCommand` scroll phrases; `runScroll` -> typed `SCROLL` bound to turn/tab/docId/frame 0; content `scrollDocument` measures before/after, reports moved/boundary/unsupported, preserves focus; `scrollSpeech` speaks from measurement ("Przewinąłem w dół", "Jesteś na końcu strony", "Wróciłem na początek strony"); no model/snapshot call. `scroll.test.ts` + e2e `conversation` PASS. |
| 3a | "powtórz" replays the last message | VERIFIED | `announce` saves only `substantive` text after the page ACK to a single `chrome.storage.session` entry keyed by tab+docId (conversation.ts `makeReplay`/`decodeReplay`); `runRepeat` replays exact text via `speakTurn(..., 'replay')`, makes no snapshot/proxy call; empty/other-doc -> `REPLAY_EMPTY`; statuses, wait notice and replay itself do not overwrite it; handled before `claimPending`, so it does not consume a pending confirmation. e2e `conversation` PASS (asserts live-log shows the answer twice and that replay text is not the wait notice). Audible delivery = H1. |
| 3b | "krócej"/"dokładniej" move across 3 levels, persisted across restart | VERIFIED (code + automated restart) | `moveVerbosity` saturates at ends; `runVerbosity` writes only the enum to `chrome.storage.local` and announces after the write succeeded; `getVerbosity` decodes defensively; verbosity feeds `/api/explore` and `/api/effect`. e2e `conversation` performs `ctx.restartBrowser()` with the same profile and asserts the level survives and replay does not (lines 182-197). Real desktop restart = H3. |
| 4a | A command over ~8 s speaks "To trwa dłużej niż zwykle" | VERIFIED | `turn.ts`: `WAIT_NOTICE_MS = 8000`, absolute `processingDeadline` set once at recording->processing (STT, model and navigation never restart it); `armWait`/`fireWait`/`waitDecision` serialized with `claimOutput` so notice is once-only and suppressed if an answer was already claimed; `rehydrateWait()` re-arms after worker restart (index.ts:16); notice is `status`, never replayed. `turn.test.ts`, `pipeline.test.ts`, e2e `lifecycle` PASS. Real-latency audible timing = H5. |
| 4b | STT, network, model failure and element-not-found are spoken plainly in Polish with a next step | VERIFIED | `STT_FAILURES` (6 codes), `MIC_FAILURES`, `failureText` mapping `blocked/timeout/network/not_configured/invalid_output` per seam, `REJECTIONS.not_found/stale` ("Nie znalazłem tego elementu na stronie. Powiedz polecenie jeszcze raz."), `EXPLORE_FAILED`, `ACTIONS_FAILED`, `SNAPSHOT_FAILED`, `PIPELINE_FAILED`; every entry point has a catch that falls back to `chrome.tts` (`failTurn`, `handleToggle`, `handleOffscreenMessage`). Fixed sentences only, no raw diagnostics. e2e `errors` PASS (95 s failure-injection run). Audible check = H6. |

**Score:** 4/4 success criteria verified in code and automated tests; 0 behavior-unverified; 0 failed.

### Plan must-have truths and prohibitions

| Item | Status | Evidence |
|---|---|---|
| Exploration never executes/queues/authorizes a mutation (test-tier prohibition) | VERIFIED | `runSummary`/`runActions` contain no `EXECUTE`, `/api/action` or `setPending`; ids discarded after rendering; `pipeline.test.ts` ("summary route never reaches the action pipeline") and e2e `exploration` (asserts no `action_proposal` request) enforce it. Test-tier prohibition has wired enforcement, not fail-closed-unverified. |
| Replay not kept after tab/document invalidation or restart (test-tier) | VERIFIED | Session-storage only; `dropReplayOf` on tab removal and on READY of a new document; docId check in `runRepeat`; e2e asserts replay gone after browser restart. |
| No stale wait notice/terminal result/replay into replacement turn, closed tab, changed document (test-tier) | VERIFIED | `waitDecision` fence on turn id/phase/claim; `claimOutput` aborted/replaced-turn guard; `ownsTurn` checks after every await; e2e `lifecycle` PASS. |
| Shorter verbosity must not remove safety refusal or recovery next step (judgment-tier) | UNVERIFIED-PROHIBITION (flagged) | Structural support: refusals/recovery lines are fixed local Polish strings independent of verbosity (verbosity only enters `/api/explore` summary and `/api/effect` prompts). Whether concise model text reads as dropping a warning is a quality judgment; routed to H4. Non-authoritative, human review recommended. |
| activeTab requested only from keyboard command; restricted URLs get honest recovery | VERIFIED (code) | manifest: `activeTab` + `scripting`, no persistent all-sites host access (`host_permissions` only proxy origin); `preparePageAccess` -> `isAccessibleUrl` rejects non-HTTP(S), Web Store; ping -> inject `content/content.js` into frame 0 ISOLATED -> ping; failure speaks via `chrome.tts` and recording does not start; `pipeline.test.ts` "restricted, missing and malformed URLs never start recording" passes. Real grant = H2. |
| Page text untrusted, masked | VERIFIED with caveat WR-03 | Mask at source (Phase 1), snapshot via `toModelText`, server fences tags and validates output; read-only route has no execution path, so injection cannot become an action. Fence hardening gap in WR-03. |

### Required Artifacts

| Artifact | Status | Details |
|---|---|---|
| `server/app/exploration.py` | VERIFIED | Strict models, `EXPLORATION_SCHEMA`, caps, validator, prompt; wired in `main.py` `/api/explore` (schema `page_exploration`) |
| `extension/src/background/pipeline.ts` | VERIFIED | `runCommand` routes repeat/verbosity/scroll before pending claim, explore after; substantive and wired |
| `extension/src/shared/conversation.ts` | VERIFIED | `parseConversationCommand`, verbosity transitions, replay/ack decoders |
| `extension/src/content/scroll.ts` | VERIFIED | Wired in content `index.ts` `SCROLL` case with sender/top-frame/docId guards |
| `extension/src/content/candidates.ts` | VERIFIED | Wired for `CANDIDATES` and `RECHECK_CANDIDATES` |
| `extension/src/shared/turn.ts` | VERIFIED | `WAIT_NOTICE_MS`, absolute deadline, `waitDecision` |
| `extension/src/shared/messages.pl.ts` | VERIFIED | Bounded Polish recovery map for all seams |
| `extension/static/manifest.json` | VERIFIED | `activeTab`, `scripting`, `commands` |
| e2e scenarios `exploration`, `conversation`, `lifecycle`, `errors` | VERIFIED | All PASS in own run |

### Key Link Verification

| From | To | Status |
|---|---|---|
| pipeline.ts -> `/api/explore` | server `main.py` explore route | WIRED (`postJson('/api/explore', ...)` in `runSummary`/`runActions`; route calls `chat_json` with `page_exploration`) |
| pipeline.ts -> content (`SNAPSHOT`/`CANDIDATES`/`RECHECK_CANDIDATES`/`SCROLL`) | content `index.ts` switch | WIRED |
| pipeline.ts -> `chrome.scripting.executeScript` | packaged `content/content.js` | WIRED (`preparePageAccess`) |
| pipeline.ts -> `chrome.storage.session` replay and wait deadline | `rememberDelivered`, `armWait`/`rehydrateWait` | WIRED |
| pipeline.ts -> `chrome.storage.local` verbosity | `runVerbosity`/`getVerbosity`, consumed by explore and effect requests | WIRED |
| offscreen.ts -> pipeline.ts (typed STT error codes) | `handleOffscreenMessage` -> `STT_FAILURES` | WIRED |
| proxy.ts `ProxyError` -> messages.pl.ts | `classifyFailure` -> `failureText` | WIRED |

### Data-Flow Trace

Spoken summary text originates from the model response, but is decoded and validated (`decodeSummary`) before `say`. Spoken action list is rendered locally from `RECHECK_CANDIDATES` role/name data (real DOM-derived), not from model text. Scroll text is rendered from the page's measured before/after positions. Replay text is the exact string last written to the live region. No hardcoded or static-fallback data paths. FLOWING.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| PAGE-02 | 03-01, 03-03 | "co tu jest?" -> 1-2 sentence summary | SATISFIED | SC 1a |
| PAGE-03 | 03-01, 03-03 | "co mogę zrobić?" -> at most 3-5 actions | SATISFIED | SC 1b |
| ACT-03 | 03-02, 03-03 | Scroll up, down, to top | SATISFIED | SC 2 |
| OUT-03 | 03-02, 03-03 | "powtórz" replays last message | SATISFIED (code); audible = H1 | SC 3a |
| OUT-04 | 03-02, 03-03 | "krócej"/"dokładniej", 3 levels, persisted | SATISFIED (code + automated restart); real restart = H3 | SC 3b |
| OUT-07 | 03-03 | ~8 s "To trwa dłużej niż zwykle" | SATISFIED (code); timing audible = H5 | SC 4a |
| OUT-08 | 03-03 | Every error spoken plainly with next step | SATISFIED (code); audible = H6 | SC 4b |

All 7 requirement IDs in PLAN frontmatter (03-01: PAGE-02, PAGE-03; 03-02: OUT-03, OUT-04, ACT-03; 03-03: OUT-07, OUT-08 plus the five above) appear in REQUIREMENTS.md as checked and mapped to Phase 3. No orphaned requirements: REQUIREMENTS.md maps exactly these 7 IDs to Phase 3 and each is claimed by a plan. Note: the checkbox status in REQUIREMENTS.md for the four audible/real-environment items is ahead of the human acceptance; treat as code-complete, pending H1-H6.

### Review Warnings versus Success Criteria

None of the four warnings defeats a success criterion; all are non-blocking WARNINGs. Dispositions in 03-REVIEW-DISPOSITION.md are all still `open`; recommend triage before demo.

| ID | Affects | Assessment |
|---|---|---|
| WR-01 mic stays open and audio uploaded after tab closed mid-recording | Privacy norm (CLAUDE.md section 3), not a roadmap SC | Confirmed in code: `handleTabRemoved` sends no cancel; offscreen only handles `REC_START`/`REC_STOP`. Capped at 25 s. Real privacy defect, recommend fix (`REC_CANCEL`) before demo. |
| WR-02 `page_exploration` schema not warmed | SC1 latency only | Confirmed: `warm_up` has only `action_proposal` and `effect_summary`. First live "co tu jest?" may be slow and could trip the 8 s notice or the 20 s timeout. Cheap fix. |
| WR-03 fence bypass via case/whitespace closing tags | PAGE-02 integrity (spoken summary social engineering) | Confirmed: `fence()` replaces only exact lowercase `</tag>`. Read-only route and local id validation bound the damage; summary text is still spoken verbatim. Recommend hardening. |
| WR-04 effect-expiry timer in memory only | SC4 "never silence" in a narrow edge | Confirmed (`setTimeout(expireJob...)` in `handleExecuting`; `rehydrateWait` re-arms only the 8 s notice). Requires worker kill within 15 s of a click that leaves extension pages; stale recovery at 30 s bounds it. Does not defeat SC4 in normal operation. |

Info items IN-01..IN-07 are hardening/cleanup; none blocks a criterion. IN-02 (pending question blocks "co tu jest?" during confirmation) is fail-closed and safe.

### Anti-Patterns Found

None blocking. No debt markers. Dead symbols noted in IN-04 (`isStale` import, `RELOAD_PAGE`, `pre_action`) are informational.

### Human Verification Required

H1-H6 from 03-ACCEPTANCE.md (all recorded `pending`, none claimed here): see frontmatter `human_verification`. Also P1-P4 Phase 1 carry-overs remain pending and are unaffected.

### Gaps Summary

No gaps. All roadmap success criteria are achieved in code and verified by 265 unit tests, 144 server tests and 17/17 headless e2e scenarios, including an automated same-profile browser restart. Remaining work is human acceptance (audible delivery, genuine activeTab grant, real restart, live-model quality, real latency) and triage of four open review warnings (WR-01 and WR-02 recommended before the demo).

---

_Verified: 2026-10-04_
_Verifier: Claude (gsd-verifier)_
