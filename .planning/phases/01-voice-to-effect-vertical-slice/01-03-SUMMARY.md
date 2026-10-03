---
phase: 01-voice-to-effect-vertical-slice
plan: 03
subsystem: extension-runtime
tags: [chrome-mv3, offscreen, mediarecorder, aria-live, esbuild, chromium, pcm16]
requires:
  - phase: 01-01
    provides: Bounded proxy routes, deterministic upstream and transcription seam
  - phase: 01-02
    provides: Masked snapshots, live policy, protocol and CDP harness
provides:
  - Loadable production extension with build-time proxy origin and no E2E hook
  - Shortcut-driven offscreen capture and validated voice-to-action pipeline
  - Accessible microphone grant and denied-permission recovery
  - Switchable 16 kHz mono PCM16 WAV and real Chromium smoke scenarios
affects: [01-04, phase-02, phase-04]
tech-stack:
  added: []
  patterns: [session-backed turn state, direct offscreen audio upload, alternating polite live region, native-setter fill, build-only test hook]
key-files:
  created:
    - extension/scripts/build.mjs
    - extension/src/background/index.ts
    - extension/src/background/pipeline.ts
    - extension/src/background/proxy.ts
    - extension/src/offscreen/offscreen.ts
    - extension/src/content/index.ts
    - extension/src/content/executor.ts
    - extension/src/content/live-region.ts
    - extension/src/options/options.ts
    - extension/src/shared/wav.ts
    - extension/src/shared/wav.test.ts
    - extension/src/env.d.ts
    - extension/static/offscreen.html
    - extension/static/options.html
    - extension/e2e/smoke.mjs
    - extension/e2e/scenarios/tracer.mjs
    - extension/e2e/scenarios/onboarding.mjs
    - extension/e2e/scenarios/wav.mjs
    - .planning/phases/01-voice-to-effect-vertical-slice/01-03-task3-red.json
  modified: [extension/package.json, extension/static/manifest.json, extension/src/shared/messages.pl.ts]
key-decisions:
  - Revalidate every live policy signal after the pre-action delay before acting.
  - Restrict build cleanup to dist and dist-e2e to prevent OUT_DIR deleting source or unrelated files.
requirements-completed: [VOICE-01, VOICE-02, VOICE-03, OUT-01, PAGE-01, ACT-01, ACT-02, ACT-04, SAFE-04]
coverage:
  - id: runtime-tracer
    description: Real offscreen recording drives masked proxy action, ordered pre-announcement and a real click.
    requirement: VOICE-01
    verification: [{kind: e2e, ref: 'npm --prefix extension run e2e -- tracer', status: pass}]
    human_judgment: false
  - id: onboarding
    description: Options opens on install, receives keyboard activation and displays microphone and shortcut status.
    requirement: VOICE-02
    verification: [{kind: e2e, ref: 'extension/e2e/scenarios/onboarding.mjs', status: pass}]
    human_judgment: false
  - id: wav-capture
    description: PCM16 WAV header, clamping, resampling, automatic 15-second stop, ended tracks and empty transcript guard.
    requirement: VOICE-03
    verification:
      - {kind: unit, ref: 'extension/src/shared/wav.test.ts', status: pass}
      - {kind: e2e, ref: 'extension/e2e/scenarios/wav.mjs', status: pass}
    human_judgment: false
  - id: real-microphone-screen-reader
    description: Clean-profile microphone grant persists to offscreen recording and NVDA/VoiceOver speaks each Polish live-region message.
    requirement: OUT-01
    verification: [{kind: manual_procedural, ref: '01-03-PLAN.md Task 2 human-check', status: unknown}]
    human_judgment: true
    rationale: Linux fake-media Chromium cannot prove permission UX, spoken output, shortcut collision or real InPost behavior.
actuals:
  tokens: 12381
  tasks: 3
  commits: 5
plan_head_before: c40fca3205b84fbdcd3542e8d9b440266c5defe2
plan_head_after: 9585df775e3f74a18129fff1f61cc7ea4d6d2dd0
duration: 20min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 3: Voice Runtime Summary

**Offscreen push-to-talk capture drives masked, locally validated page actions with Polish live-region announcements, accessible microphone onboarding and a switchable PCM16 WAV fallback.**

## Performance

- Started: 2026-10-03T13:46:05Z
- Completed production work: 2026-10-03T14:05:42Z
- Tasks: 3; realized files: 21 extension files plus persisted RED evidence.
- Actual tokens use chars/4 of the realized extension/evidence Git diff, excluding pre-existing config edits and close-out metadata. Commit count is measured from the persisted plan ledger through the stated plan_head_after.

## Accomplishments

- esbuild renders narrow proxy-origin permissions and bundles service worker, content, offscreen and options entrypoints. Production JavaScript contains no test hook; content JavaScript contains no capture API.
- Session-backed turns relay explicit toggle presses to mono webm/opus capture, capped at 15 seconds. Offscreen uploads raw audio itself; only text crosses runtime messaging. Whitespace transcripts return locally before page snapshot or model egress.
- Source masking, serialized egress assertion and current live-element policy gate every model action. Pre-lines use the validated element name, and native setters plus bubbling input/change/key events support field fills.
- Alternating status nodes preserve Polish text as textContent without changing focus or adding tab stops. Options opens on install and permission denial; Enter activates the mic-grant button and reports status as text.
- WAV rebuilds send mono 16 kHz PCM16 data. Browser checks inspect actual upload header fields, automatic stop, ended tracks and zero model requests for whitespace transcription.

## Task Commits

1. Task 1: `4f17191` — voice recording to validated page actions. Build, typecheck, 66 unit tests, bundle/source acceptance and tracer 1/1 passed. The entire tracer verification was rerun successfully before expansion.
2. Task 2: `5bdf34d` — keyboard microphone onboarding and denied-permission recovery. Build/typecheck, semantic HTML acceptance and tracer/onboarding 2/2 passed.
3. Task 3 RED: `7f0f3ef` — WAV behavior tests plus minimal API declaration. GREEN: `186e6ca` — encoder, downsample and switchable recording. All 70 unit tests, typecheck and tracer/onboarding/wav 3/3 passed.
4. Safety follow-up: `9585df7` — recorder-error track cleanup and stronger cap/empty/audio-header browser assertions. Final build/typecheck, 70 tests and E2E 3/3 passed; WAV scenario took 19389 ms including an actual 15-second cap.

## Verification

- Final `npm --prefix extension run build`: exit 0; default output remains webm and default origin remains http://localhost:8787.
- Final `npm --prefix extension run typecheck`: exit 0; no TypeScript errors.
- Final `npm --prefix extension test`: **70 passed, 0 failed, 0 skipped**.
- Final `npm --prefix extension run e2e -- tracer onboarding wav`: **3/3 passed**, no FAIL lines. Test browser/profile, proxy and fake upstream are cleaned up.
- `AUDIO_FORMAT=ogg npm --prefix extension run build`: fails before removing build output, as required.
- All per-task acceptance assertions passed: rendered manifest tokens absent; default permission present; production test hook absent/E2E hook present; capture absent from content/present in offscreen; session state and egress/validation call sites; semantic options/status/autofocus/onInstalled; every WAV header/clamp/resample assertion.
- Tracer proves ordered Słucham/Przetwarzam/Klikam lines, actual delayed fixture result, one action upstream request, correct button grammar, lang=pl, no tabindex and unchanged focus.
- No packages were added and neither lockfile changed. No source TODO/FIXME or unwired implementation stub remains; empty arrays in capture and announcer modules are live queues populated by actual events.

## TDD Gate Compliance

Task 3 intentionally failed `encodes complete 16 kHz mono PCM16 WAV header`: expected 50 bytes, actual 0 bytes. All four planned behavior tests failed on assertions. Persisted `01-03-task3-red.json` was accepted as **RED_EVIDENCE_OK** before implementation. RED commit precedes GREEN; all four WAV tests now pass. No refactor was necessary.

## Decisions Made

Recheck live visibility, disabled state, role, sensitivity, connection and irreversible policy across the 300 ms pre-action delay. Keep output cleanup within two dedicated directories rather than allow arbitrary recursive removal.

## Deviations from Plan

1. **[Rule 2 - Missing Critical] Live policy across announcement delay:** recompute the full verdict after waiting, rather than connection alone, so a page mutation cannot bypass policy between announcement and execution (`extension/src/content/executor.ts`, `4f17191`).
2. **[Rule 2 - Missing Critical] Safe build cleanup:** reject OUT_DIR outside dist/dist-e2e before recursive removal (`extension/scripts/build.mjs`, `4f17191`). Both required output layouts work.
3. **[Rule 2 - Missing Critical] Capture error cleanup:** stop all tracks and suppress a failed recording's subsequent upload on MediaRecorder error (`extension/src/offscreen/offscreen.ts`, `9585df7`). Typecheck, unit suite and full browser suite passed afterward.

## Issues Encountered

Chromium keyboard Enter requires the CDP char event in addition to keyDown/keyUp; an empty status with retained autofocus established that the incomplete synthetic sequence had not activated the button. The corrected full sequence proves keyboard grant. Automatic capture termination has no REC_STOP test payload, so cap acceptance uses the proxy's configured stub transcript and empty acceptance uses a separate explicit second press. This changes the tests only, preserving production behavior.

## Human Checks Collected for End of Phase

These are **pending, not fabricated successes**; WINDOWS.md entry 4 records the clean-profile/accessibility check.

- On clean Chrome with NVDA (Windows) or VoiceOver (macOS), confirm the install options tab and Enter-operated microphone grant produce the spoken status, and that the grant persists to offscreen recording with no microphone prompt on inpost.pl.
- On the tracking page, confirm Alt+Shift+A reaches the extension rather than NVDA/Windows layout switching; hear Słucham, Przetwarzam and Klikam Znajdź in order, including repeated and rapid live-region announcements, while browse mode is active and focus stays in the field.
- Confirm Polish voice/language selection and pre-announcement survives a navigating click. Real screen-reader timing is not proven by DOM logs.
- Existing provider checks remain pending: genuine microphone webm/WAV through the teammate's Whisper implementation and live model mapping/latency. This plan uses the explicitly authorized proxy STT stub and deterministic fake upstream; it introduces no product stub.

## Next Phase Readiness

Ready for 01-04 settle/diff/effect wiring. Content executor currently returns action metadata; the service worker finishes the action turn without effect read-back, which is the next plan's declared responsibility. Keep the E2E ctx contract when adding scenarios. Shared requirement completion remains governed by the sibling-summary readiness gate, and human acceptance remains visible separately.

## Self-Check: PASSED

All 19 created files exist, all five production/RED commits resolve in Git, and final build/typecheck/unit/browser acceptance passed. Genuine human checks remain unknown and recorded; summary is committed before state and roadmap updates.
