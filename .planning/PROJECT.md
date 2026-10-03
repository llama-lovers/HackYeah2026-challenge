# Polish Voice Agent for Blind Users (HackYeah 2026)

## What This Is

A Chrome extension (Manifest V3) that gives blind and low-vision users a **voice agent for Polish websites and e-services**. The user talks to the agent (push-to-talk); the agent understands the current page, describes it on request, performs actions (click, fill fields, scroll, navigate) and **always says what it did and what the result was**, speaking through the user's own screen reader via an ARIA live region.

Built at a ~24h hackathon by 2–3 people: one reliable end-to-end demo scenario matters more than breadth. The demo scenario is **tracking an InPost parcel** (inpost.pl parcel tracking).

## Core Value

A blind user can say a Polish voice command on a real Polish site and hear, through their own screen reader, a short confirmation of **what the agent did and what actually happened**. Sensitive data never leaves the browser.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Push-to-talk keyboard shortcut records the user's voice; audio is transcribed (Whisper via OpenRouter, module owned by another team member) into Polish text
- [ ] Agent reads the page as an accessibility tree / simplified DOM (not raw HTML, not screenshots by default)
- [ ] Sensitive fields (password, PESEL, IBAN, card number, CVV, one-time codes) are masked before anything is sent to the model
- [ ] Commands: describe page ("co tu jest?"), list possible actions ("co mogę zrobić?"), click by description, fill simple fields, scroll
- [ ] Model returns a structured action proposal (action, target element, text to say, needs-confirmation); the extension validates it before executing
- [ ] Irreversible actions (payments, form submission, deletion, account changes, legal consents) require a spoken "tak" confirmation
- [ ] Agent never types passwords, SMS/BLIK codes, or solves captcha. It stops, says why, and suggests human help
- [ ] Agent asks instead of guessing when the target element is ambiguous
- [ ] After every action the agent re-reads page state and announces the effect ("Klikam Sprawdź." → "Paczka jest w drodze, …")
- [ ] Announcements go through an ARIA live region (the user's screen reader voice); `chrome.tts` (pl-PL) is the fallback
- [ ] Barge-in: "stop" or a shortcut immediately stops speech and actions
- [ ] Short, distinct, toggleable earcons for routine states (working, done, needs confirmation)
- [ ] Extension UI (enable, settings, errors) is fully usable by keyboard and screen reader
- [ ] Small backend proxy holds the OpenRouter API key and forwards LLM and transcription requests; no keys in the extension or repo
- [ ] Demo scenario works end-to-end: "sprawdź status przesyłki numer …" on InPost tracking → status read back

### Out of Scope

- Shared database of labels for unlabeled elements — post-hackathon ("what's next" slide)
- Multi-browser and mobile support — Chrome MV3 only for the demo
- Be My Eyes integration for captcha — agent just stops and asks for human help
- Fully local/offline AI — cloud model via OpenRouter is enough for the demo
- Implementing Whisper transcription ourselves — owned by another team member; we only integrate
- Custom high-quality TTS (ElevenLabs/Azure) — screen reader via ARIA live is the primary voice, `chrome.tts` is the fallback
- Demo Plan B (InPost mock page, canned/offline responses, backup recording) — team prepares the demo separately; this project builds the app only
- Other demo scenarios (e-urząd, banking, shopping) — one polished scenario beats several shaky ones
- Logging page content or user commands — privacy; only local debug, off by default

## Context

- Similar projects exist (Wayfinder, Diamond Access AI, AriaPilot, Screen Agent, Vision Assistant Pro for NVDA). "Voice + agent + page reading" alone is not a differentiator. Our differentiators:
  1. Polish language and Polish services, with one polished end-to-end scenario (InPost)
  2. Confirming **effects**, not only intentions
  3. Speaking in the user's screen reader voice (ARIA live), with own TTS only as fallback
  4. Sensitive-data protection: masked before reaching the model
  5. Testing with a real blind user, shown in the presentation
- Every design decision should strengthen one of these; otherwise it's probably out of scope.
- Agent communication rules: short (1–2 sentences), announcement first then effect, plain Polish with no jargon, amounts and numbers read clearly, errors stated directly with a next step (never silence).
- Testing: manual demo script before each show; NVDA (Windows) or VoiceOver (macOS) running alongside; verify in the DevTools Network tab that sensitive data isn't sent; a 15–30 min session with a blind user if possible.
- Pitch line (draft): *"Polski agent głosowy dla osób niewidomych, który mówi głosem twojego czytnika ekranu, potwierdza każdy skutek i nie wysyła twoich danych wrażliwych do chmury."*
- Source of truth for team rules: `CLAUDE.md` in repo root.

## Constraints

- **Language**: Code, identifiers, technical comments, and commits in **English**. All user-facing messages (voice and UI) in **Polish**. Confirmed by user at initialization.
- **Timeline**: ~24h hackathon, 2–3 developers. Vertical slice first (voice → action → effect), polish later.
- **Platform**: Chrome extension, Manifest V3 (content script + service worker + offscreen document).
- **Tech stack**: Extension in **TypeScript** (esbuild build, no framework). Backend proxy in **Python** (FastAPI + httpx). Python cannot run inside a Chrome extension, so it is used for the proxy only.
- **Dependencies**: Add none without a clear reason. Every dependency is a hackathon risk.
- **Security**: No API keys in extension code or repo; keys live in the backend proxy via environment variables.
- **Privacy**: Send the model the minimum (accessibility tree / simplified DOM). Screenshots only if unavoidable and with sensitive fields masked.
- **Accessibility**: Extension itself fully operable without mouse or sight. No information conveyed only visually.
- **Integration**: Speech-to-text (Whisper via OpenRouter) is built by another developer. We record audio on push-to-talk and send it to their transcription component, receiving Polish text.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Demo scenario: InPost parcel tracking | No login, no sensitive data, simple form: the most reliable live demo | — Pending |
| Small backend proxy holds API key | CLAUDE.md rule: no keys in the extension | — Pending |
| OpenRouter for everything (LLM + Whisper) | One API and one key; Whisper already planned via OpenRouter by teammate | — Pending |
| STT: Whisper (teammate's module); we record audio, they transcribe | Better Polish quality; split work across team | — Pending |
| Fallback TTS: `chrome.tts` (pl-PL) instead of `speechSynthesis` | Works from service worker, has `stop()` for barge-in, explicit language; changed after research | — Pending |
| Primary voice output: ARIA live region | Uses the user's screen reader voice (differentiator #3) | — Pending |
| Accessibility tree / simplified DOM over screenshots | Privacy + fewer tokens | — Pending |
| Model proposes structured actions; extension validates and executes | Enforces confirmation of irreversible actions and the sensitive-data rules | — Pending |
| Code in English, user messages in Polish | User instruction at init | ✓ Good |
| Extension in TypeScript, proxy in Python (FastAPI) | User prefers Python; Python can't run in MV3 extension, TS gives typed protocol/action schema | — Pending |
| Demo Plan B out of project scope | Team prepares demo separately | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-10-03 after initialization*
