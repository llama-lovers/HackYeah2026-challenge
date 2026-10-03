# Phase 1: Voice-to-Effect Vertical Slice - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

A user presses the push-to-talk shortcut on inpost.pl, speaks a Polish command, and hears through their own screen reader (ARIA live region) what the agent did and what actually changed. The pipeline is: offscreen recording → proxy `/api/transcribe` → masked DOM snapshot → proxy chat call → one validated click or fill → settle → re-snapshot → diff → effect summary → live region. Sensitive fields are masked in the content script, and the OpenRouter key exists only in the Python proxy's environment.

Requirements: VOICE-01, VOICE-02, VOICE-03, OUT-01, PAGE-01, SAFE-04, ACT-01, ACT-02, ACT-04, ACT-07, PROXY-01, PROXY-02, PROXY-03.

Not in this phase: confirmations / "tak" (Phase 2), InPost number normalization (Phase 2), "co tu jest?" / scrolling / "powtórz" / full error wording (Phase 3), earcons, silence auto-stop, barge-in, `chrome.tts` output mode, full options page (Phase 4).

</domain>

<decisions>
## Implementation Decisions

### Effect announcement
- **D-01:** The effect comes from a **deterministic diff plus a second model call**. After the action settles, the content script re-snapshots and computes a diff against the pre-action snapshot (added/removed text, new alert/status text, URL/title change, enabled/disabled/value state changes). Only the **diff** (masked, like everything else) and the executed action go to the model, which returns a 1-sentence Polish effect summary. The full new snapshot is not sent for this call.
- **D-02:** If the diff is empty, no second model call is made. The extension says one plain sentence built from a template, e.g. "Kliknąłem Szukaj, ale na stronie nic się nie zmieniło." There is no next-step suggestion in Phase 1.
- **D-03:** Settle: MutationObserver with an **800 ms quiet window and a 6 s hard cap**. The user chose this over 400 ms/4 s for slow XHR results on InPost.
- **D-04:** The pre-action line comes from a **template using the validated element's accessible name** ("Klikam {name}." / "Wpisuję w pole {name}."), not the model's `say` text, so the announcement always matches what is executed.
- **D-05:** If an action triggers full navigation, the pending "announce effect" job (action, pre-snapshot digest/diff basis, timestamp) is stored in `chrome.storage.session`. The new page's content script picks it up on load, snapshots, and announces. Stale jobs (older than the cap) are dropped. — **Reversibility:** reversible

### Push-to-talk
- **D-06:** Default shortcut **Alt+Shift+A** via `chrome.commands`, rebindable at chrome://extensions/shortcuts.
- **D-07:** Toggle: the first press starts recording and the second press stops and sends it. There is a **15 s hard cap** that auto-stops and sends, so the mic never stays open.
- **D-08:** Mic state is announced through the same live region with short text: "Słucham." when `MediaRecorder.onstart` fires (not before, to avoid clipping) and "Przetwarzam." on stop. Phase 4 may swap these for earcons.
- **D-09:** A press while a command is still processing is ignored, and the user hears "Jeszcze pracuję." There is one command at a time and no cancel in Phase 1 (barge-in is Phase 4).
- **D-10:** On a tab without the content script (not inpost.pl or the dev fixtures), the service worker speaks via `chrome.tts` (pl-PL): "Agent działa na razie tylko na stronie InPost." Host permissions stay narrow.

### Transcription integration
- **D-11:** The seam is a **route in our FastAPI proxy**: `POST /api/transcribe`. The teammate implements a Python function `transcribe(audio_bytes: bytes, mime: str) -> str` inside the proxy, using the same OpenRouter key from env and always sending `language=pl`. The offscreen document `fetch`es this route directly (no Blob over runtime messaging) and sends only the text to the service worker. — **Reversibility:** costly — the teammate builds against this Python signature and route
- **D-12:** Audio is `audio/webm;codecs=opus`, mono, at about 32 kbps. Smoke-test it through OpenRouter Whisper first. If it is rejected, fall back to 16 kHz mono PCM16 WAV encoded in the offscreen doc (hand-written header, no library).
- **D-13:** Stub: `STT_MODE=stub` makes `/api/transcribe` return a fixed transcript (from an env var, overridable by a query param for dev), so the whole pipeline runs without Whisper. `STT_MODE=whisper` uses the real module.
- **D-14:** There is no transcript echo. The agent goes straight to "Klikam …".
- **D-15:** An empty or whitespace transcript is caught locally with no model call, and the user hears "Nic nie usłyszałem. Spróbuj jeszcze raz."

### Proxy hosting & access
- **D-16:** **Localhost only** (uvicorn, e.g. `http://localhost:8787`). The key goes in `server/.env` (gitignored, check `.gitignore`), with a committed `.env.example` that has no values. There is no deploy config in this phase.
- **D-17:** Access control: **CORS locked to `chrome-extension://<fixed id>`** (the extension ID is fixed via `"key"` in manifest.json), plus a request body-size cap and `max_tokens` cap. There is no demo token and no rate limit.
- **D-18:** The proxy URL is a **build-time esbuild `define`** (`PROXY_URL`), defaulting to localhost and overridable by an env var at build. It contains no secret.
- **D-19:** **The proxy owns the system prompt and JSON schema.** This overrides the research recommendation to keep them in the extension. The extension sends `{utterance, snapshot, history?}` for the action call and `{action, diff}` for the effect call. The proxy builds the OpenRouter request (pinned `anthropic/claude-sonnet-5.5`, `response_format: json_schema` strict, `require_parameters: true`, low temperature), validates the response against the schema, and returns the proposal. The extension still does all element validation (ACT-04): the id exists in the current map, the element is visible and enabled, and the role matches. — **Reversibility:** costly — the request/response contract between extension and proxy is shaped around it
- **D-20:** The proxy never logs request or response bodies, only method, route, status and latency.
- **D-21:** The masking check uses a **local fixture page served by the proxy** (e.g. `GET /fixtures/sensitive.html`) with password, PESEL, IBAN, card number, CVV and one-time-code fields, and `http://localhost:8787/*` is added to `content_scripts.matches`. This is a dev/test fixture, not the out-of-scope demo Plan B.

### Post-research decisions (2026-10-03)
- **D-22:** Success criterion 2 targets the real InPost tracking submit button **"Znajdź"** (never disabled). Effect scenario: fill the parcel number → "kliknij Znajdź" → "Klikam Znajdź." → effect read back. The "Szukaj becomes enabled" check is dropped. "kliknij Szukaj" serves as the negative test: the hidden/disabled mobile search button must be rejected (ACT-04), and the header link to /szukaj exercises the D-05 navigation handoff.
- **D-23:** The spoken element name in templates (D-04) is the **placeholder if present, otherwise the accessible name**. On InPost the label is in English but the placeholder is Polish.
- **D-24:** Phase 1 **fails closed** on irreversible actions. If the model sets `needs_confirmation`, or the target matches the extension-side irreversible-action regex (pay/send/delete/consent/submit outside the tracking form), the action is not executed. The user hears one sentence, e.g. "Tej akcji nie wykonam bez potwierdzenia." Phase 2 replaces this with the "tak" flow.
- **D-25:** Add a local **`tracking-form.html` fixture** served by the proxy (next to `sensitive.html`). It mimics the InPost tracking form (input, submit button, a disabled hidden button, a delayed XHR-like result render), so criteria 2–3 and settle/diff can be tested offline on Linux.

### Claude's Discretion
- Exact diff algorithm and how the diff is serialized for the effect call.
- Proxy route names other than `/api/transcribe`, the port number, and the request/response JSON field names.
- The Phase 1 action vocabulary in the schema beyond click/fill (keep it minimal, but leave room for Phase 2/3 values without breaking the schema).
- Whether short conversation history is sent in Phase 1 (a `chrome.storage.session` buffer is fine, and it can also be omitted).
- Snapshot caps and prioritization (research suggests ~250 nodes, ~120 chars per node, viewport + main first).
- Minimal options page content for Phase 1: only the mic-grant button with a `role="status"` result is required. The full accessible options page is Phase 4.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project rules and scope
- `CLAUDE.md` — non-negotiable safety/privacy/accessibility rules (§3), agent speech style (§4), hackathon scope (§6)
- `.claude/CLAUDE.md` — tech stack decisions and overrides (TS + esbuild, FastAPI proxy, `chrome.tts` fallback); detailed stack rationale for mic/offscreen, DOM walker, masking, structured output, live region
- `.planning/PROJECT.md` — core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — requirement IDs for this phase (VOICE-01..03, OUT-01, PAGE-01, SAFE-04, ACT-01/02/04/07, PROXY-01..03)
- `.planning/ROADMAP.md` §Phase 1 — goal, 5 success criteria, risk-spike notes

### Research
- `.planning/research/STACK.md` — offscreen recording, mic grant, OpenRouter STT/chat, structured output schema rules (note: Hono/plain-JS parts are superseded by TS + FastAPI)
- `.planning/research/ARCHITECTURE.md` — component layout and message flow
- `.planning/research/PITFALLS.md` — MV3 SW lifetime, live-region timing, framework input events, webm/Whisper quirks
- `.planning/research/FEATURES.md` — feature landscape and differentiators
- `.planning/research/SUMMARY.md` — research synthesis

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None. This is a greenfield repo (only `CLAUDE.md`, `.claude/CLAUDE.md`, `.gitignore`, `.planning/`).

### Established Patterns
- No code conventions yet. Follow `.claude/CLAUDE.md`: no framework, no dependencies without a reason, state in `chrome.storage.session` and not in SW globals, element ids in a content-script `Map<string, WeakRef<Element>>` (never written into the page DOM), native value setter + `input`/`change` events for fills.

### Integration Points
- The teammate's Whisper code plugs into the proxy as `transcribe(audio_bytes, mime) -> str` behind `POST /api/transcribe` (D-11).
- `.gitignore` already exists. Verify that it covers `server/.env` and build output before the first commit.

</code_context>

<specifics>
## Specific Ideas

- Fixed Polish strings for Phase 1: "Słucham.", "Przetwarzam.", "Jeszcze pracuję.", "Nic nie usłyszałem. Spróbuj jeszcze raz.", "Agent działa na razie tylko na stronie InPost.", "Klikam {name}.", "Wpisuję w pole {name}.", "Kliknąłem {name}, ale na stronie nic się nie zmieniło."
- Success criterion 2 walkthrough: "wpisz [numer] w pole numeru przesyłki" → the Szukaj button becomes enabled; "kliknij Szukaj" → "Klikam Szukaj." → effect read from the page. Consecutive live-region messages must each be announced (clear and re-set with a short delay, or alternate nodes).
- Live-region checks need an NVDA (Windows) or VoiceOver (macOS) machine. The dev box is Linux.

</specifics>

<deferred>
## Deferred Ideas

None. The discussion stayed within phase scope (confirmations, earcons, barge-in, deployment and token auth are already assigned to later phases or out of scope).

</deferred>

---

*Phase: 01-voice-to-effect-vertical-slice*
*Context gathered: 2026-10-03*
