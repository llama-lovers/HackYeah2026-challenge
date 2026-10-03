# Walking Skeleton — Polish Voice Agent for Blind Users (HackYeah 2026)

**Phase:** 1
**Generated:** 2026-10-03

## Capability Proven End-to-End

On the InPost tracking page (or its offline fixture), the user presses Alt+Shift+A, speaks a Polish command, presses it again, and hears through their own screen reader "Klikam Znajdź." followed by what actually changed on the page. The pipeline runs shortcut → offscreen recording → proxy transcription → masked page snapshot → proxy + pinned Claude model → validated click → live-region announcement.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Extension framework | Chrome MV3, TypeScript, esbuild, no UI framework. Service worker is ESM; content, offscreen and options bundles are IIFE | Locked in .claude/CLAUDE.md. One build script, about 10 ms builds, no runtime dependencies. Types guard the message protocol between 4 contexts |
| Contexts | Service worker = orchestrator (only `chrome.commands` listener, owns turn state). Offscreen document = microphone + upload. Content script = stateless sensor/actor (snapshot, mask, validate, execute, settle, live region). Options page = one-time mic grant | MV3 lifetimes: the SW dies when idle, offscreen is the only background place for `getUserMedia`, and only the content script sees the DOM |
| Persistent state ("data layer") | No database. `chrome.storage.session` holds the turn state `{phase, tabId, startedAt}` (read and written on every shortcut press) and the pending-effect job for navigation handoff (written before a click, read by the next page's READY). The element-id map is in content-script memory (`Map<id, WeakRef<Element>>`, per epoch) | SW globals vanish on termination. Session storage is in-memory, cleared on restart, and not exposed to content scripts. Ids are never written into the page DOM |
| Backend | Python FastAPI + httpx + uvicorn, managed with uv (`server/`), app factory `app.main:create_app` | Locked (user prefers Python). The proxy is the only holder of the OpenRouter key |
| Model integration | OpenRouter chat completions, pinned `anthropic/claude-sonnet-5.5`, `response_format: json_schema` strict + `provider.require_parameters: true`, temperature 0. The proxy owns the prompts and schemas (D-19). Action schema enum is `click \| fill \| none` (no navigation) | One request per user turn, plus one effect call only when the diff is non-empty (D-01/D-02) |
| Transcription seam | `POST /api/transcribe` (raw audio body, `audio/*` Content-Type) → `transcribe(audio_bytes: bytes, mime: str) -> str` in `server/app/stt.py`. The teammate's Whisper code plugs in as `app/stt_whisper.py`. `STT_MODE=stub\|whisper`. Whole-utterance only; streaming STT is deferred (01-STT-BRIEF.md) | Frozen D-11 contract (costly to change). The offscreen document uploads directly, so no Blob crosses runtime messaging |
| Auth / access | No user auth. Proxy accepts browser requests only from `chrome-extension://<fixed id>` (Origin guard + CORS), Host allow-list (localhost), 2 MB body cap, per-route `max_tokens`. The extension ID is fixed by the committed manifest `key` and derived by the proxy from it | D-16/D-17: localhost-only hackathon proxy. Origin guard stops cross-site POSTs from spending credit; the credit limit on the key is the backstop |
| Privacy | Masking happens in the content script before anything leaves it: field signals plus whole-token PESEL/Luhn/NRB checksums. The SW egress guard refuses any body the masker would still change, and the transcript is masked before the chat call. The proxy never logs bodies | Differentiator #4 and CLAUDE.md §3. The parcel number (8 or 24 digits) is never masked |
| Output | Pre-rendered, visually hidden live region with two alternating `role=status` nodes, `lang="pl"`, serial queue. `chrome.tts` pl-PL only when no content script exists (D-10) | Differentiator #3: the user's own screen reader voice |
| Deployment target | Localhost only (D-16). No deploy config. LAN IP build only for the NVDA test machine | Hackathon scope |
| Directory layout | `extension/` (`src/shared` pure + node tests, `src/background`, `src/content`, `src/offscreen`, `src/options`, `static/`, `scripts/`, `e2e/`), `server/` (`app/`, `tests/`, `fixtures/`) | Pure logic is testable with `node --test` on `.ts`. The runtime contexts mirror the MV3 split. Fixtures are served by the proxy (D-21/D-25) |
| Testing | `node --test` (pure TS), `tsc --noEmit`, pytest with `httpx.MockTransport`, CDP `dom-check` on fixtures, and a CDP E2E smoke (`extension/e2e/smoke.mjs`) that drives the real extension in Chromium against the real proxy and a deterministic fake OpenRouter (`server/tests/fake_openrouter.py`) | Zero extra dependencies. NVDA speech, the clean-profile mic grant, live OpenRouter/Whisper and the Network-tab proof stay as end-of-phase human checks |

## Stack Touched in Phase 1

- [ ] Project scaffold: `extension/package.json` + `tsconfig.json` + `scripts/build.mjs`; `server/pyproject.toml` + `uv.lock`; test runners `node --test`, pytest, CDP smoke (plans 01-01, 01-02, 01-03)
- [ ] Routing: proxy routes `/health`, `/api/transcribe`, `/api/action`, `/api/effect`, `/fixtures/*`; extension message routes PING/SNAPSHOT/EXECUTE/ANNOUNCE/SETTLE_DIFF/READY (plans 01-01, 01-03, 01-04)
- [ ] Persistent state: real read and write of `chrome.storage.session` for turn state and the pending-effect job (plans 01-03, 01-04)
- [ ] UI: the push-to-talk shortcut, the live region, and the options page mic-grant button wired through the SW to the proxy (plan 01-03)
- [ ] Deployment: documented local full-stack run (below)

## Local Full-Stack Run

```bash
# proxy (terminal 1)
cp server/.env.example server/.env        # then fill OPENROUTER_API_KEY; STT_MODE=stub until the Whisper module lands
uv sync --directory server
uv run --directory server uvicorn app.main:create_app --factory --port 8787 --no-access-log

# extension
npm --prefix extension ci
npm --prefix extension run build          # PROXY_URL=http://<host>:8787 for another machine; AUDIO_FORMAT=wav if Whisper rejects webm
# chrome://extensions -> Developer mode -> Load unpacked -> extension/dist ; grant the mic on the options tab that opens
# open https://inpost.pl/sledzenie-przesylek or http://localhost:8787/fixtures/tracking-form.html, press Alt+Shift+A

# checks
uv run --directory server pytest -q
npm --prefix extension test && npm --prefix extension run typecheck
npm --prefix extension run dom-check
npm --prefix extension run e2e            # needs chromium + uv on PATH; HEADFUL=1 to watch
```

## Out of Scope (Deferred to Later Slices)

- Spoken "tak" confirmation flow, secret/captcha refusal flow, numbered disambiguation, step bound, Didomi consent handling, number normalization and readback (Phase 2). Phase 1 fails closed on irreversible actions (D-24)
- "co tu jest?", "co mogę zrobić?", scrolling, "powtórz", verbosity, the 8 s "To trwa dłużej niż zwykle" notice, full error wording with next steps (Phase 3). Phase 1 speaks one fixed sentence per failure
- Earcons, silence auto-stop, barge-in/stop, `chrome.tts` output mode, full options page and privacy preview (Phase 4)
- Streaming STT (OpenAI Realtime). Deferred by the user (01-STT-BRIEF.md §4)
- Proxy deployment, demo token, rate limiting (D-16/D-17); demo Plan B (out of project scope)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without changing its architectural decisions:

- Phase 2: Safe InPost parcel tracking. Confirmations replace the D-24 fail-closed rule inside `validateProposal`/`pipeline`; the number parser plugs in before `/api/action`; the action enum grows (new strict schema version)
- Phase 3: Page exploration and conversation. New action values (`answer`, `scroll`), a message history buffer in `chrome.storage.session`, error wording in `messages.pl.ts`
- Phase 4: Audio control and accessible settings. Earcons via the offscreen `AUDIO_PLAYBACK` reason, a stop command, a `chrome.tts` output mode behind `announce()`, and the full options page
