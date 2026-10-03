# Project Research Summary

**Project:** Polish Voice Agent for Blind Users (HackYeah 2026)
**Domain:** Chrome MV3 LLM voice-agent accessibility extension (Polish e-services, demo: InPost parcel tracking)
**Researched:** 2026-10-03
**Confidence:** MEDIUM-HIGH

## Executive Summary

A Polish voice agent for blind/low-vision users is achievable at hackathon pace with a vertical-slice approach: push-to-talk records speech, a backend proxy forwards to Claude Sonnet 5.5 via OpenRouter, the model proposes one action per turn, the extension validates it against masking and confirmation rules, executes, re-reads the page and announces the effect through the user's screen reader via an ARIA live region.

The competitive edge is not "voice + agent + page reading" (competitors such as Diamond Access AI, Wayfinder, Navable already do this) but three tightly coupled moves: (1) one deeply polished Polish scenario (InPost tracking, no login), (2) **verified effect announcements** quoting page state rather than model speculation, and (3) **screen-reader voice integration that really works** (ARIA live primary, `chrome.tts` fallback, never both at once).

The stack is intentionally minimal: plain JavaScript (no bundler), offscreen document for audio, own DOM walker (no `chrome.debugger`), Hono proxy (~100 lines). Key risks: ARIA live behaviour varies across screen readers and must be tested with NVDA on the real demo machine; the dev box is Linux.

## Key Findings

### Recommended Stack

- Plain ES2022 JavaScript, no bundler/TypeScript/framework, zero npm deps in the extension; ES modules for SW/offscreen/options, classic scripts for content script
- Mic: one-time `getUserMedia` grant from the options page; recording in an offscreen document (`USER_MEDIA` + `AUDIO_PLAYBACK`); never `getUserMedia` from the content script (per-site prompt on inpost.pl). Fixed `key` in manifest for a stable extension ID
- Audio: `audio/webm;codecs=opus` ~32 kbps → OpenRouter `/api/v1/audio/transcriptions` (`openai/whisper-large-v3-turbo`, `language: "pl"`); WAV encoder as fallback if provider rejects webm
- Push-to-talk: toggle semantics (`chrome.commands` has no keyup) + silence auto-stop ~1.2 s + separate stop shortcut; avoid Ctrl+Alt+letter (AltGr on Polish layout) and Alt+D
- **[RECOMMENDED CHANGE]** Fallback TTS: `chrome.tts` with `lang: 'pl-PL'` instead of `speechSynthesis` — works from the service worker, has `stop()` for barge-in, voice availability checkable at startup. `speechSynthesis` is absent in SW and often has no voices on Linux
- Page understanding: own DOM walker (~150 lines), short ids `e1…` in `Map<id, WeakRef<Element>>`, no attributes written to the page
- Proxy: Hono 4.13.12 + `@hono/node-server` 2.1.3, Node 22+, routes `/api/chat`, `/api/transcribe`, `/health`; deployable to Cloudflare Workers; no body logging; demo token header + OpenRouter credit cap
- LLM: `anthropic/claude-sonnet-5.5` via OpenRouter, `response_format: json_schema` strict + `provider.require_parameters`; fallback forced tool call behind one `callModel()`; pin the model id
- Earcons: Web Audio oscillators in offscreen document

### Expected Features

**Table stakes:** push-to-talk, page summary on request, "co mogę zrobić?", click/fill by description, confirmation before irreversible actions, read-back of dictated 24-digit parcel number, "powtórz", one action per utterance with step cap, instant "working" earcon, ask-on-ambiguity.

**Differentiators:**
- D1 grounded effect reports (quote status text from DOM; deterministic InPost status extractor)
- D2 screen-reader voice that actually works (no double voice)
- D3 provable privacy (masking inside extraction + local debug view, Network-tab proof)
- D4 Polish-first handling (number words, plain Polish)
- D5 "krócej / dokładniej" verbosity commands (P2)
- D6 cookie-consent guard (Didomi = legal consent → requires "tak") (P2)
- D7 blind-user test findings in the pitch

**Anti-features:** auto-summary on page load, saved-profile PII autofill, cross-site memory, always-listening/wake word, own TTS as primary, screenshots by default, autonomous multi-step loops, chatty persona, reading whole page, auto-accepting cookie banners, login/banking in demo.

### Architecture Approach

- Service worker = orchestrator (agent loop, policy engine, all network via single `egress` choke point); content script = stateless sensor/actor (snapshot, masking, execute, settle detection, live region host); offscreen = mic + earcons; options page = mic grant + settings; proxy = stateless key holder
- Typed message envelope with `target` tag and correlation ids; audio crosses contexts as base64 (or offscreen fetches proxy directly)
- Turn state machine with `AbortController` + epoch counter for barge-in; state mirrored to `chrome.storage.session` (SW dies after ~30 s idle); resume after navigation via `tabs.onUpdated` + content script `READY`
- Bounded single-agent loop (≤5 LLM calls per utterance), no planner/navigator split
- Deterministic confirmation: "tak" matched locally; stored pending action executed, never re-planned. Policy can only **raise** confirmation (model flag OR local risk heuristic); InPost "Szukaj" lookup must not count as irreversible
- Observe-after-act: MutationObserver + ~400 ms quiet window, diff; "nic się nie zmieniło" if no change
- Snapshot = `modelText` (sent to LLM) + `meta` (local only)
- No `navigate(url)` tool (limits prompt-injection)

### Critical Pitfalls

1. Mic permission prompted on page origin; one "Deny" silently breaks all later calls → grant on options page, record in offscreen
2. ARIA live region not announced: must exist before text changes, identical text not re-announced, no `display:none`, modal/consent overlays can silence it → one pre-rendered region, clear→wait→set; voice mode is an explicit setting (cannot detect screen reader)
3. Barge-in can't cancel text already handed to screen reader; mic echo and Whisper silence hallucinations can produce fake "tak" → headset, keyboard stop as instant path
4. LLM hallucinated element ids → validate exists/visible/enabled/role before acting; deterministic fast path for InPost
5. Prompt injection from page content (InPost ad slots) → extension computes irreversibility itself; nav allowlist
6. Masking false positives: 24-digit parcel number looks like PESEL/IBAN → no substring scanning, checksum validation, allowlist `#ShipmentNumber`
7. InPost: Szukaj button disabled until `input` event → native value setter + input/change events, verify effect from post-action snapshot; Didomi banner; duplicate desktop/mobile UI; pre-existing `aria-live` regions; Cloudflare
8. Latency 10–15 s dead air (record + Whisper + LLM) → instant earcon, regex fast path, timeouts, token budget
9. Demo-day network failure → demo mode with canned responses + saved InPost page (SingleFile), honestly labelled; hotspot

## Implications for Roadmap

### Phase 0: Risk Spikes (~2 h)
Mic permission on clean profile; PTT shortcut on demo OS with NVDA; live region speaks a second message under NVDA; `chrome.tts` pl-PL voice inventory; InPost DOM/result-flow inspection; proxy health; freeze STT contract `transcribe(blob, {language:'pl'}) -> {text}` with teammate.

### Phase 1: Vertical Slice (~4–6 h)
Typed command → LLM → click/fill → re-read → announce against InPost mock; masking built here; proxy `/api/chat`; SW loop; latency metric and demo-mode hook early.

### Phase 2: Page Understanding & Safety (~2–3 h)
Snapshot extraction, masking unit tests + Network audit, validator, confirmation state machine, injection test page, egress choke point.

### Phase 3: Voice In/Out (~2–3 h)
Offscreen recording + Whisper integration, live region queue/dedupe, voice-mode switch, earcons, barge-in.

### Phase 4: InPost Hardening (~2–3 h)
Real inpost.pl, Didomi, 24-digit number dictation/read-back, result detection, Polish wording, latency < 6 s.

### Phase 5: Resilience & Demo (~2–3 h)
Offline demo mode, clean-profile run, SW termination mid-turn, blind-user session, final audit, frozen rehearsal script.

### Phase Ordering Rationale
Define `shared/protocol` and the `Proposal` schema in hour 1 so 2–3 devs work in parallel (content script / SW+policy+proxy / audio+STT+options). Risky platform unknowns first; real-site polish after fallbacks exist.

### Research Flags
- Deeper research: P0 (offscreen mic grant, NVDA + modal overlays, Polish `chrome.tts` voice, webm via provider), P4 (InPost results XHR vs reload, Didomi on clean profile)
- Standard patterns: proxy, schema-validated proposals, confirmation state machine, masking checksums, DOM walker

## Confidence Assessment

| Area | Level | Notes |
|------|-------|-------|
| Stack | HIGH | MV3 facts documented; Hono versions verified |
| Features | MEDIUM-HIGH | Table stakes well sourced; Polish user context unverified until blind-user session |
| Architecture | MEDIUM-HIGH | MV3 lifecycle documented; live region + modal needs real testing |
| Pitfalls | MEDIUM-HIGH | Some need live verification (mic on clean profile, NVDA) |
| Integration | MEDIUM | Whisper interface to confirm with teammate |

### Gaps to Address
1. TTS decision: `chrome.tts` (research) vs `speechSynthesis` (PROJECT.md)
2. Whisper contract with teammate at hour 0
3. Windows/macOS + NVDA test machine (dev env is Linux)
4. Polish voice on demo machine
5. Saved InPost page + canned responses for demo mode
6. InPost result rendering (XHR vs reload) with a real tracking number
7. Blind-user session owner and schedule

## Sources

Detailed sources with confidence levels are listed in each dimension file:

### Primary (HIGH confidence)
- `.planning/research/STACK.md` — Chrome MV3 official docs, OpenRouter docs/models endpoint, npm registry (via Context7/WebFetch)
- `.planning/research/ARCHITECTURE.md` — Chrome offscreen/SW lifecycle/messaging/tts docs

### Secondary (MEDIUM confidence)
- `.planning/research/PITFALLS.md` — live-region guidance, InPost static HTML fetched 2026-10-03, injection/masking papers
- `.planning/research/FEATURES.md` — competitor pages, BLV GenAI user studies

### Tertiary (LOW confidence)
- Agent-loop patterns (Nanobrowser, Browser Use) from prior knowledge; AriaPilot unverified

---
*Research completed: 2026-10-03*
*Ready for roadmap: yes*
