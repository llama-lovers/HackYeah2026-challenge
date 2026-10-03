---
phase: 01-voice-to-effect-vertical-slice
plan: 01
subsystem: api
tags: [fastapi, httpx, openrouter, pydantic, whisper, privacy, pytest]
requires: []
provides:
  - Local key-holding action/effect proxy with strict provider and local schemas
  - Frozen raw-audio transcription seam and intentional D-13 stub mode
  - Origin/Host/upload guards, safe errors and body-free logging
  - Deterministic stdlib fake upstream with real HTTP integration coverage
affects: [01-02, 01-03, 01-04, whisper-integration]
tech-stack:
  added: [fastapi 0.142.2, httpx 0.28.1, uvicorn 0.54.0, pytest 9.1.1]
  patterns: [factory lifespan shared AsyncClient, pure ASGI guards, strict Pydantic output validation, threadpool transcription]
key-files:
  created:
    - server/pyproject.toml
    - server/uv.lock
    - server/app/__init__.py
    - server/app/config.py
    - server/app/schemas.py
    - server/app/prompts.py
    - server/app/openrouter.py
    - server/app/main.py
    - server/app/stt.py
    - server/app/middleware.py
    - server/tests/conftest.py
    - server/tests/test_action.py
    - server/tests/test_seams.py
    - server/tests/test_security.py
    - server/tests/fake_openrouter.py
    - server/.env.example
  modified: []
key-decisions:
  - "Use the same-checkout phase branch to satisfy the executor protected-branch guard while preserving existing edits."
  - "Validate the complete bounded upload before route execution so an oversized chunked JSON prefix cannot spend upstream credit."
patterns-established:
  - "One request-local completion through a lifespan-owned shared httpx AsyncClient."
  - "Provider failures and validation errors return short deterministic codes, without bodies or exception text."
requirements-completed: [PROXY-01, PROXY-02, PROXY-03, VOICE-03]
coverage:
  - id: D1
    description: Strict pinned-model action and effect request/response contracts
    requirement: PROXY-02
    verification:
      - kind: unit
        ref: "uv run --directory server pytest -q tests/test_action.py tests/test_seams.py"
        status: pass
    human_judgment: false
  - id: D2
    description: Origin/Host guards, declared/chunked body cap, non-echoing errors and body-free concurrent logging
    requirement: PROXY-03
    verification:
      - kind: unit
        ref: "uv run --directory server pytest -q tests/test_security.py"
        status: pass
    human_judgment: false
  - id: D3
    description: Environment key isolation and names-only env template
    requirement: PROXY-01
    verification:
      - kind: unit
        ref: "server/tests/test_security.py#test_env_loading_and_defaults"
        status: pass
      - kind: other
        ref: "git ls-files server/.env empty; tracked key-shaped-string scan clean"
        status: pass
    human_judgment: false
  - id: D4
    description: Stub and threadpool transcription route with frozen teammate seam
    requirement: VOICE-03
    verification:
      - kind: unit
        ref: "server/tests/test_seams.py#test_whisper_threadpool_and_errors"
        status: pass
    human_judgment: false
  - id: D5
    description: Deterministic fake upstream exercised over real loopback HTTP
    verification:
      - kind: integration
        ref: "server/tests/test_seams.py#test_real_http_fake_upstream"
        status: pass
    human_judgment: false
  - id: D6
    description: Live OpenRouter schema output, latency and reasoning-token observation
    verification: []
    human_judgment: true
    rationale: "No API key is configured; live provider behavior cannot be proven by mocks."
  - id: D7
    description: Real Polish Whisper transcription and webm/opus acceptance
    verification: []
    human_judgment: true
    rationale: "Needs the teammate-owned Whisper module, a real key and microphone audio."
actuals:
  tokens: 23391
  tasks: 3
  commits: 5
commits: 5
plan_head_before: c2160f36d4365a977e98a2c69aba7221fbf718e6
plan_head_after: 05cc6ce3a33a7c7fac003fa5541c8c5105b04479
duration: 16min
completed: 2026-10-03
status: complete
---

# Phase 1 Plan 1: Local Voice-Agent Proxy Summary

**FastAPI proxy with pinned strict-schema action/effect calls, worker-thread STT seam, bounded uploads and body-free errors/logging, verified with 53 tests.**

## Performance

- Started: 2026-10-03T12:59:27Z
- Completed: 2026-10-03T13:15:30Z
- Tasks: 3
- Server files created: 16; two persisted RED evidence records.
- Actual token estimate: realized pre-summary diff of 93,564 characters / 4 = 23,391. Commit count measured from the persisted plan ledger before close-out metadata commits.

## Accomplishments

- `/health`, `/api/action`, `/api/effect`, `/api/transcribe` and `/fixtures` are wired through a factory with one shared lifespan-owned client. Keys stay in server environment configuration.
- Both provider schemas use strict JSON with require_parameters; local output validation rejects extra fields and incorrect types. Polish Unicode limits, closing-fence neutralization and concurrent request independence are covered.
- Transcription accepts raw audio and exact MIME values, invokes the frozen synchronous seam outside the event loop, handles silence and redacts provider failures. D-13 stub mode is ready for extension development.
- Foreign origins, foreign Hosts and oversized declared/chunked uploads are rejected. Safe 422/500 responses and concurrent canary tests prove that payload/query/exception text is omitted from logs.
- The fake upstream runs as `uv run --directory server python -m tests.fake_openrouter --port 8799 --record /tmp/fake-openrouter.jsonl`; its pure reply rules and real HTTP round trip are tested.

## Task Commits

1. Task 1 tracer: `5c821c4` — strict-schema action proxy; 16 tests passed, then tracer feedback rerun passed.
2. Task 2 RED: `f337100` — transcription/effect/fake upstream behavior tests. GREEN: `bde362b` — implementation; 43 tests passed.
3. Task 3 RED: `9c26a34` — access/body/logging tests. GREEN: `05cc6ce` — implementation; 53 tests passed.

## Verification

- Final `uv run --directory server pytest -q`: **53 passed**, 1 warning, 1.08 seconds.
- Exactly fastapi/httpx/uvicorn runtime dependencies and pytest dev; uv.lock committed; imports succeed. No prohibited optional packages were added.
- `server/.env` is untracked and absent; no OpenRouter key environment variable is present. Tracked key-shaped-string scan passed. `.env`, `.venv` and `__pycache__` ignore checks passed.
- All task acceptance criteria are covered by the tests and artifact/CLI checks, including CORS preflight, fixed extension-ID vector, missing-key zero upstream calls, max_tokens 300/150, STT threadpool and fake recording of exactly one HTTP request.
- `server/app/stt_whisper.py` is absent as required; fake upstream imports are stdlib only. The fake CLI help loads successfully.

## TDD Gate Compliance

| Task | RED behavior | Gate | GREEN |
|------|--------------|------|-------|
| 2 | Target stub endpoint assertion: expected 200, actual 404 | RED_EVIDENCE_OK | 43 passed |
| 3 | Target origin guard assertion: expected 403, actual 422 | RED_EVIDENCE_OK | 53 passed |

Both RED commits precede their implementation commits. No separate refactor was needed. Evidence is persisted in `01-01-task2-red.json` and `01-01-task3-red.json`. The GSD JUnit parser matches `classname` as `name`, so records target the isolated test class; the commands each execute exactly one named test with the behavior assertion shown in their XML. Task 2 evidence was corrected and revalidated before GREEN after the initial class/name mismatch.

## Decisions Made

Use a phase branch in the existing checkout to enforce mandatory protected-branch safety. Validate complete bounded uploads before routes see them. Preserve all pre-existing planning/config/runtime edits.

## Deviations from Plan

1. **[Rule 3 - Blocking] Protected main branch:** the executor contract refuses main commits, despite branching_strategy=none. Created `gsd/phase-01-voice-to-effect-vertical-slice` in the same checkout with orchestrator agreement; no worktree or config override.
2. **[Rule 2 - Missing Critical] Complete bounded-body gate:** the research receive-wrapper could cut an oversized chunked request into a valid JSON prefix and still call upstream. Buffer at most MAX_BODY_BYTES request-locally before invoking the route; raw ASGI and chunked action tests prove zero application/upstream calls on overflow (`05cc6ce`).
3. **[Rule 2 - Missing Critical] Strict boolean and URL-log hygiene:** use StrictBool so model strings cannot be coerced into action-policy flags; suppress HTTPX informational URL logging so query canaries stay out of all captured logs (`5c821c4`, `05cc6ce`).

## Known Stubs

| File | Line | Stub | Reason / resolution |
|------|------|------|---------------------|
| server/app/stt.py | 13 | Intentional D-13 STT stub; real Whisper module is teammate-owned and absent | Plan explicitly provides stub mode and lazy integration seam; teammate supplies app/stt_whisper.py before live VOICE-03 acceptance. |

These intentional seams satisfy this plan's stub/integration scope; real provider acceptance remains pending. The stub and two unrun live verifications are recorded in `.planning/WINDOWS.md`.

## Issues Encountered

One known Starlette TestClient warning advises httpx2. It is documented by research; no extra dependency was added. GSD RED evidence class/name parsing required class-level matching for isolated JUnit runs. Sandbox-required uv cache/network and Git operations used explicit escalation.

## User Setup Required / Outstanding Human Checks

See `01-USER-SETUP.md`. No live call was attempted without credentials, and no live check is claimed as passed.

1. With a real credit-limited key configured securely, the agent starts factory-mode uvicorn on port 8787 and posts `kliknij Znajdź` with a snapshot containing `button e4 "Znajdź"`. Expected: schema-valid click e4 around six seconds or less. Record elapsed time and reasoning-token usage without retaining content.
2. Teammate provides `app/stt_whisper.py`, selects STT_MODE=whisper, and records a three-second Polish phrase using audio/webm;codecs=opus. Agent posts it to `/api/transcribe`; expect the spoken Polish text. A rejected webm format triggers plan 01-03's WAV build fallback. This cannot be proven offline.

## Next Phase Readiness

Ready for 01-02/01-03 extension development with stub STT and fake OpenRouter. Manifest-derived extension ID remains unresolved until 01-02 creates its manifest, so all browser origins fail closed meanwhile. Real Whisper and live model checks remain end-of-phase UAT items.
