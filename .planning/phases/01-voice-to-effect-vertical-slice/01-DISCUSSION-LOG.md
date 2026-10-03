# Phase 1: Voice-to-Effect Vertical Slice - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-10-03
**Phase:** 01-voice-to-effect-vertical-slice
**Areas discussed:** Effect announcement, Push-to-talk feel, Transcribe integration, Proxy hosting & access

---

## Effect announcement

| Option | Description | Selected |
|--------|-------------|----------|
| Diff + 2nd model call | Deterministic diff, model writes a 1-sentence summary | ✓ |
| Deterministic diff only | Rule-based announcement, no extra call | |
| 2nd model call, full snapshot | Model describes the whole new page | |

| No change | | |
|---|---|---|
| Say it plainly | One sentence | ✓ |
| Say it + suggest next step | | |

| Settle timing | | |
|---|---|---|
| 400 ms / 4 s | Research default | |
| 800 ms / 6 s | Safer for slow XHR | ✓ |
| You decide | | |

| Pre-action line | | |
|---|---|---|
| Template from element name | Always matches executed action | ✓ |
| Model's say text | | |

| Navigation | | |
|---|---|---|
| Resume from chrome.storage.session | | ✓ |
| Announce new title only | | |
| You decide | | |

## Push-to-talk feel

| Question | Options | Selected |
|---|---|---|
| Shortcut | Alt+Shift+A / Ctrl+Shift+Space / Alt+Shift+M | Alt+Shift+A |
| Stop recording | Second press + 15 s cap / Second press only | Second press + 15 s cap |
| Mic state feedback | Live-region text / Minimal beep / Nothing | Live-region text |
| Busy press | Ignore + "Jeszcze pracuję." / Cancel and re-record | Ignore + "Jeszcze pracuję." |
| Off-site tab | chrome.tts message / Silent / Inject everywhere | chrome.tts message |

## Transcribe integration

| Question | Options | Selected |
|---|---|---|
| Seam | Route in our FastAPI proxy / Teammate's own service / TS function in extension | Route in our FastAPI proxy |
| Audio format | webm/opus + WAV fallback / WAV from start | webm/opus + WAV fallback |
| Stub | Env-selected fixed transcript / Typed text box / Both | Env-selected fixed transcript |
| Transcript echo | No echo / Echo briefly | No echo |
| Empty transcript | Local "Nic nie usłyszałem…" / Send to model | Local message |

## Proxy hosting & access

| Question | Options | Selected |
|---|---|---|
| Hosting | Localhost only / + deployable config / Deploy now | Localhost only |
| Access control | CORS to extension origin / + demo token / + token + rate limit | CORS to extension origin |
| Proxy URL | Build-time constant / Options page field | Build-time constant |
| Prompt + schema location | Proxy owns / Extension owns, proxy passes through | Proxy owns (overrides research) |
| Masking test page | Local fixture served by proxy / Node unit tests only | Local fixture served by proxy |

## Claude's Discretion

- Diff algorithm and serialization, route/field names, port, Phase 1 action vocabulary, whether to send history, snapshot caps, minimal options page content.

## Deferred Ideas

None.
