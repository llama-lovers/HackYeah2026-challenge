# Requirements: Polish Voice Agent for Blind Users (HackYeah 2026)

**Defined:** 2026-10-03
**Core Value:** A blind user can say a Polish voice command on a real Polish site and hear, through their own screen reader, a short confirmation of what the agent did and what actually happened, and sensitive data never leaves the browser.

Conventions: code, identifiers and commits in English; every user-facing message (voice and UI) in Polish. Extension in TypeScript (MV3), proxy in Python (FastAPI).

## v1 Requirements

### Voice Input

- [ ] **VOICE-01**: User can start and stop recording with a single toggle keyboard shortcut (push-to-talk), with no mouse
- [ ] **VOICE-02**: User grants microphone access once on the extension's options page and is never prompted on websites
- [ ] **VOICE-03**: Recorded audio is transcribed to Polish text via the teammate's Whisper module (OpenRouter) through the proxy, behind a stable `transcribe(audio) -> text` interface
- [ ] **VOICE-04**: Recording auto-stops after a short silence
- [ ] **VOICE-05**: User hears an earcon when the mic opens and when it closes

### Speech Output

- [ ] **OUT-01**: User hears every agent message through their own screen reader via a pre-rendered ARIA live region
- [ ] **OUT-02**: User can switch the output mode to built-in voice (`chrome.tts`, pl-PL) when no screen reader is running; the two voices never speak at the same time
- [ ] **OUT-03**: User can say "powtórz" to hear the last message again
- [ ] **OUT-04**: User can say "krócej" or "dokładniej" to change verbosity (3 levels, remembered across sessions)
- [ ] **OUT-05**: Numbers, dates and PLN amounts are spoken in readable Polish (e.g. "trzysta czterdzieści dziewięć złotych", digit groups)
- [ ] **OUT-06**: User hears short, distinct earcons for "working", "done" and "needs confirmation", and can turn them off
- [ ] **OUT-07**: If a command takes longer than ~8 s, user hears "To trwa dłużej niż zwykle"
- [ ] **OUT-08**: Every error is spoken plainly with a suggested next step (STT failure, network failure, model failure, element not found). Never silence

### Page Understanding

- [ ] **PAGE-01**: Extension builds a simplified accessibility snapshot of the page (roles, names, states, short element ids) instead of sending raw HTML or screenshots
- [ ] **PAGE-02**: User can ask "co tu jest?" and hears a 1–2 sentence page summary
- [ ] **PAGE-03**: User can ask "co mogę zrobić?" and hears at most 3–5 available actions

### Actions

- [ ] **ACT-01**: User can click an element by describing it in Polish ("kliknij Szukaj")
- [ ] **ACT-02**: User can fill a text field by dictation; the extension fires real input/change events so the page reacts (e.g. InPost enables the search button)
- [ ] **ACT-03**: User can scroll up, down and to the top
- [ ] **ACT-04**: The model returns a structured action proposal (action, element id, text to say, needs-confirmation); the extension validates that the element exists, is visible and enabled, and that its role matches before executing
- [ ] **ACT-05**: Each spoken command runs at most a small bounded number of steps, then reports and waits
- [ ] **ACT-06**: When several elements match or the label is unclear, the agent asks with numbered options (max 3) instead of guessing
- [ ] **ACT-07**: Agent announces the action first ("Klikam Szukaj."), then re-reads the page after it settles and announces the actual effect, or says nothing changed

### Safety & Privacy

- [ ] **SAFE-01**: Irreversible actions (payment, order, form submission other than search, deletion, account changes, legal consents) require a spoken "tak" before execution; the decision is made by a deterministic policy in the extension, and the model can only add confirmations, never remove them
- [ ] **SAFE-02**: The confirmed action is executed exactly as proposed; "tak" is matched locally and never sent to the model for re-planning
- [ ] **SAFE-03**: Agent never types passwords, SMS/BLIK codes or one-time codes and never attempts captcha; it stops, says why, and suggests human help
- [ ] **SAFE-04**: Sensitive fields (password, PESEL, IBAN, card number, CVV, one-time codes) are masked inside the content script before any data leaves it; the InPost parcel number is not falsely masked
- [ ] **SAFE-05**: Barge-in: the stop shortcut (or "stop") immediately stops fallback speech, in-flight requests and pending actions
- [ ] **SAFE-06**: Cookie-consent banners (e.g. Didomi on inpost.pl) are treated as legal consent and require "tak"
- [ ] **SAFE-07**: User can open a local-only privacy preview showing exactly what would be sent to the model (off by default, nothing logged remotely)

### Backend Proxy

- [ ] **PROXY-01**: A Python (FastAPI) proxy holds the OpenRouter API key from environment variables; no key exists in the extension or repo
- [x] **PROXY-02**: The proxy forwards chat (Claude via OpenRouter, structured JSON output) and transcription requests, pins the model, and caps request size and tokens
- [ ] **PROXY-03**: The proxy never logs request or response bodies

### InPost Scenario

- [ ] **INPOST-01**: User can say "sprawdź status przesyłki numer …" on inpost.pl tracking, and the agent fills the number, runs the search and reads back the status
- [ ] **INPOST-02**: The dictated parcel number is normalized from Polish words to digits, validated (8 or 24 digits), read back in groups and confirmed with "tak" before searching
- [ ] **INPOST-03**: The parcel status is quoted from the page DOM ("Status na stronie: …"), not paraphrased by the model

### Extension UI Accessibility

- [ ] **A11Y-01**: Options page (mic grant, output mode, earcons on/off, verbosity, privacy preview) is fully operable by keyboard and screen reader, with proper labels, roles and focus order
- [ ] **A11Y-02**: No state is conveyed only visually (color, icon, animation)

## v2 Requirements

Deferred. Tracked but not in the current roadmap.

- **V2-01**: "Pokaż źródło" voice command reading the raw status text
- **V2-02**: Additional Polish scenarios (e-urząd, bank balance, shopping cart)
- **V2-03**: Fallback STT via Web Speech API when Whisper is unavailable
- **V2-04**: Screenshot-based understanding for unlabeled elements (with masking)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Demo Plan B (InPost mock page, canned/offline responses, backup recording) | Team prepares the demo separately; this project builds the app only |
| Implementing Whisper transcription | Owned by another team member; we only integrate |
| Shared label database for unlabeled elements | Post-hackathon ("what's next" slide) |
| Multi-browser and mobile | Chrome MV3 only |
| Be My Eyes integration for captcha | Agent stops and asks for human help instead |
| Fully local/offline AI | Cloud model via OpenRouter is enough |
| External TTS (ElevenLabs/Azure) | Screen reader is primary voice, `chrome.tts` is fallback |
| Auto-summary on every page load | Collides with screen reader speech |
| Always-listening / wake word | Mic picks up screen reader speech |
| Saved-profile PII autofill, cross-site memory | Conflicts with privacy rules |
| Autonomous multi-step agent loops | Blind-user studies show failures to terminate; one bounded action per command |
| `navigate(url)` tool for the model | Limits prompt-injection paths |
| Login/banking flows in the demo | Sensitive data and unreliability |
| Python inside the extension | Not possible in MV3; Python used for the proxy only |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| VOICE-01 | Phase 1 | Pending |
| VOICE-02 | Phase 1 | Pending |
| VOICE-03 | Phase 1 | Pending |
| VOICE-04 | Phase 4 | Pending |
| VOICE-05 | Phase 4 | Pending |
| OUT-01 | Phase 1 | Pending |
| OUT-02 | Phase 4 | Pending |
| OUT-03 | Phase 3 | Pending |
| OUT-04 | Phase 3 | Pending |
| OUT-05 | Phase 2 | Pending |
| OUT-06 | Phase 4 | Pending |
| OUT-07 | Phase 3 | Pending |
| OUT-08 | Phase 3 | Pending |
| PAGE-01 | Phase 1 | Pending |
| PAGE-02 | Phase 3 | Pending |
| PAGE-03 | Phase 3 | Pending |
| ACT-01 | Phase 1 | Pending |
| ACT-02 | Phase 1 | Pending |
| ACT-03 | Phase 3 | Pending |
| ACT-04 | Phase 1 | Pending |
| ACT-05 | Phase 2 | Pending |
| ACT-06 | Phase 2 | Pending |
| ACT-07 | Phase 1 | Pending |
| SAFE-01 | Phase 2 | Pending |
| SAFE-02 | Phase 2 | Pending |
| SAFE-03 | Phase 2 | Pending |
| SAFE-04 | Phase 1 | Pending |
| SAFE-05 | Phase 4 | Pending |
| SAFE-06 | Phase 2 | Pending |
| SAFE-07 | Phase 4 | Pending |
| PROXY-01 | Phase 1 | Pending |
| PROXY-02 | Phase 1 | Complete |
| PROXY-03 | Phase 1 | Pending |
| INPOST-01 | Phase 2 | Pending |
| INPOST-02 | Phase 2 | Pending |
| INPOST-03 | Phase 2 | Pending |
| A11Y-01 | Phase 4 | Pending |
| A11Y-02 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 38 total
- Mapped to phases: 38
- Unmapped: 0 ✓

---
*Requirements defined: 2026-10-03*
*Last updated: 2026-10-03 after roadmap creation*
