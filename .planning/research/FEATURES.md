# Feature Research

**Domain:** Voice/agent accessibility browser extension for blind and low-vision users (Polish sites, demo: InPost parcel tracking)
**Researched:** 2026-10-03
**Confidence:** MEDIUM (competitor features: MEDIUM, mostly hackathon submission pages and store listings; user-complaint evidence: MEDIUM, academic studies read as summaries; Polish/InPost specifics: LOW-MEDIUM, one page fetch)

> Sizing is for a ~24h hackathon with 2-3 developers. Complexity: LOW = under 1h, MEDIUM = 1-4h, HIGH = more than 4h or needs a spike.
> Rule from CLAUDE.md: a feature that does not strengthen differentiators 1-5 is probably out of scope.

---

## What the field looks like (short)

| Product | Type | What it does (verified from sources) | Notes for us |
|---------|------|--------------------------------------|--------------|
| **Diamond Access AI** (Mind Forge, AMD hackathon Jul 2026) | Chrome MV3 ext. | Alt+D push-to-talk; auto page summary and "common actions" on every page load; list/navigate links; compare products; form fill from saved profile; cross-site context; safety confirmation for irreversible actions (e.g. form submit). Gemma on AMD cloud, browser TTS. | Closest competitor. Auto-summary on every load and saved-profile autofill are things we deliberately skip (see Anti-Features). Alt+D also collides with Chrome's address-bar shortcut (my own knowledge, not in their docs). |
| **Wayfinder** (AI Tinkerers hackathon winner) | Agent on real Chrome (browser-use + Playwright) | Voice in/out via ElevenLabs; NL to browser actions; conversational summaries; keeps conversation context; uses the user's logged-in Chrome; DOM + accessibility tree, no vision. | Own TTS voice (not the screen reader's), logged-in sessions (sensitive-data risk). Open-source status unverified (open question in CLAUDE.md). |
| **Screen Agent** (CUNY BMCC pilot, May 2026) | Chrome ext., local AI | Voice-first "conversational search"; always-open assistant panel; chat history persists across pages; adjustable reading speed; extracts page structure so it works on badly built sites; local AI chosen for privacy. | Local AI is out of scope for us. Cross-page memory is a privacy cost. |
| **Navable** (academic, v0.1.2) | Chrome ext. | Voice or text commands ("scroll down", "list headings"); scans headings/links/buttons/inputs/landmarks; **ARIA live regions to work alongside screen readers**; optional TTS; AI page summaries and Q&A; form navigation; password fields excluded from summaries. | Shows that "ARIA live + masking passwords" is not unique, so our differentiators 3 and 4 must be shown as *verified and polished*, not merely present. |
| **Vision Assistant Pro** (NVDA add-on, Gemini, open source) | NVDA add-on | Snapshot of the control under the navigator cursor or whole screen, AI description, follow-up chat with context memory; user's own API key. | Image/visual description, not action-taking. Complementary, not competing. |
| **Be My AI / PictureSmart (JAWS) / FSCompanion** | Image description / help chat | Describe photos and images; JAWS Picture Smart via ChatGPT/Claude; follow-up questions. | Established mental model: "ask, get a description, ask a follow-up". |
| **ScreenGuardian** (hackathon) | Multimodal web agent | Voice + screen understanding + action planning; **risk assessment and confirmation before sensitive actions (purchase/payment)**. | Confirms confirm-before-irreversible is expected, not special. |
| **AriaPilot** | - | **Not found in any search** (only unrelated VoicePilot, Hey AI Copilot, ChromePilot). Treat as unverified; do not cite features from it in the pitch. | - |

**Takeaway:** the commodity core (push-to-talk + page summary + click/fill + confirm irreversible) is already built by several hackathon teams. Our room to win is **execution quality on one Polish flow**, **effect verification**, **screen-reader voice integration that really works**, and **provable privacy**.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing these = blind testers will say it is unusable or unsafe.

| # | Feature | Why Expected | Complexity | Notes |
|---|---------|--------------|------------|-------|
| T1 | Push-to-talk hotkey with earcon on mic open/close | Every competitor has a hotkey (Diamond: Alt+D). Open-mic is a bad idea next to a screen reader (mic picks up its speech). | MEDIUM | `chrome.commands` fires on keydown only, **no keyup**, so true "hold to talk" needs a content-script key listener or a toggle with silence auto-stop. Needs a spike. Avoid Alt+D (Chrome address bar) and screen-reader modifier keys (Insert/CapsLock). Mic permission is awkward from content scripts; plan an offscreen document or extension page. |
| T2 | Polish speech to text (teammate's Whisper module) | Without it, nothing works. | MEDIUM (integration only) | Define the interface early: audio blob in, Polish text out. 24-digit parcel numbers are the weak spot (see T7). |
| T3 | "Co tu jest?" page-level description | The core promise of Diamond, Wayfinder, Screen Agent: summary instead of linear reading. | MEDIUM | From accessibility tree / simplified DOM. Keep to 1-2 sentences by default. |
| T4 | "Co mogę zrobić?" list of available actions | Diamond "suggests common actions"; discoverability for non-visual users. | LOW | Cap at about 3-5 items, grouped. Shopping-agent study: cap simultaneous options at 3. |
| T5 | Click by spoken description | Basic agent capability. | MEDIUM | Resolve to element id in the simplified DOM, not coordinates. |
| T6 | Fill a text field by dictation | Basic agent capability; needed for the tracking-number demo. | LOW | Dispatch real input/change events (framework-controlled inputs). |
| T7 | **Read-back of dictated values before submitting** ("Numer: 6 0 1 ... Dobrze?") | Dictating 24 digits through STT is error-prone; users repeatedly ask for double-checks because voice leaves no visual record. | LOW | Group digits, normalise spoken digits and strip spaces, validate length (InPost shows a 24-character example) and ask again on mismatch. Highest value-per-hour item for the demo. |
| T8 | Scroll up/down/top | In MVP scope; cheap. | LOW | |
| T9 | Spoken confirmation ("tak") before irreversible actions | Diamond and ScreenGuardian both do this. In CLAUDE.md as non-negotiable. | MEDIUM | **Deterministic policy in the extension**, not model judgement: Polish keyword list ("Zapłać", "Zamów", "Wyślij", "Usuń", "Akceptuję", "Zgadzam się", "Potwierdzam"), `type=submit` on non-search forms, cookie/consent buttons. Model's `needs_confirmation` can only add confirmations, never remove them. |
| T10 | Stop / barge-in ("stop" or shortcut) | In CLAUDE.md. Users must always be able to cut an agent off. | MEDIUM | Cancel speechSynthesis, clear live-region queue, abort in-flight fetch and pending action. The extension cannot silence NVDA/JAWS itself (user presses Ctrl). |
| T11 | Announce the *effect* after every action | Core value. Users distrust output they cannot verify; trust is the dominant complaint in BLV studies. | MEDIUM | Re-read page state after the action (wait for DOM settle or timeout), then speak. See D1 for the grounded version. |
| T12 | Speak through ARIA live region, with automatic speechSynthesis fallback | Navable does it; the agent must cooperate with the user's screen reader. | MEDIUM | Reliability is the big risk (see Pitfalls note below). Never speak through both channels at once. |
| T13 | Errors spoken plainly with a next step | CLAUDE.md rule; silence after failure is the worst outcome. | LOW | Central `say(error, nextStep)` helper; cover STT failure, network failure, model failure, element not found. |
| T14 | "Powtórz" (repeat last message) | Audio is ephemeral; there is no visual record to re-scan. | LOW | Store the last announcement string. |
| T15 | Sensitive field masking before anything goes to the model | CLAUDE.md non-negotiable; Navable excludes passwords; blind users' top privacy worry is data retention. | MEDIUM | `type=password`, name/id/autocomplete/label heuristics for PESEL, IBAN, card, CVV, OTP. Replace value with `[MASKED]`, keep the field's label and existence. Verify in Network tab. |
| T16 | Hard stop at password / SMS / BLIK code / captcha | CLAUDE.md non-negotiable. Captcha is the #1 hurdle in WebAIM screen-reader survey. | LOW | Detect, say why, suggest human help. Never type. |
| T17 | Ask instead of guessing on ambiguity (numbered options, max 3) | CLAUDE.md; computer-use agent studies show grounding failures are a top failure class. | MEDIUM | Answer with "pierwszy / drugi / trzeci" or "żaden". |
| T18 | One action per utterance, bounded steps, always terminates | CUA diary study (8 blind users, 1,258 commands): best model only 52.5% success; failures in grounding, planning, constraint tracking and **termination**. | LOW | No autonomous multi-step loops in the MVP. Hard cap (e.g. 3 actions) per command, then report and wait. |
| T19 | Instant "working" earcon, plus a timeout message | Silence while the LLM thinks reads as "broken". | LOW | Earcon within a few hundred ms; spoken "To trwa dłużej niż zwykle" after about 8s. |
| T20 | Extension UI fully keyboard and screen-reader operable | CLAUDE.md non-negotiable; test with NVDA before calling it done. | LOW-MEDIUM | Minimal: options page (earcons on/off, voice fallback on/off, verbosity), popup with focus management. No visual-only state. |
| T21 | Polish number, date and amount speech | CLAUDE.md communication rules ("trzysta czterdzieści dziewięć złotych"). | LOW-MEDIUM | Simple formatter for digits groups, dates and PLN amounts; also instruct the model in the prompt. Screen readers read digits oddly with Polish voices. |

### Differentiators (Competitive Advantage)

Aligned with CLAUDE.md differentiators 1-5. Pick few, make them demo-visible.

| # | Feature | Value Proposition | Complexity | Notes |
|---|---------|-------------------|------------|-------|
| D1 | **Grounded effect reports**: status text quoted from the DOM, not paraphrased by the model | Attacks the biggest documented complaint: users cannot verify AI output and fear confident hallucinations. For InPost: extract the status block deterministically (CSS/role-based), have the model only shorten, and speak "Status na stronie: ...". | MEDIUM | Differentiator 2. Add a "pokaż źródło" voice command that reads the raw text. Compare with Diamond/Wayfinder, which narrate model summaries. |
| D2 | **Screen-reader voice that actually works** (pre-rendered live region, debounce vs. page-change announcements, single-voice guarantee, fallback toggle) | Competitors either use own TTS (Wayfinder/ElevenLabs, Diamond browser TTS) or mention ARIA live without proving it. Collisions of voices are a real, documented annoyance. | MEDIUM | Differentiator 3. Needs real NVDA testing; ARIA live behaviour differs across JAWS/NVDA/VoiceOver (see Pitfalls). |
| D3 | **Provable privacy**: masking layer plus a local-only debug view of "what would be sent to the model" | Pitch line: "nie wysyła danych wrażliwych do chmury". Show it live in DevTools Network. | LOW-MEDIUM | Differentiator 4. Debug view off by default (CLAUDE.md: no logging of content). Run on a mock login/payment page for the demo. |
| D4 | **Polish-first prompt and utterance handling** (Polish verbs/cases, "Znajdź", "Dodaj kolejny numer", Polish number words, cookie banners) | Wayfinder/Diamond/Screen Agent are English-first. Polish case/inflection and Polish site conventions are where generic agents stumble. | LOW-MEDIUM | Differentiator 1. Keep a small Polish synonym table for button labels and consent wording. |
| D5 | Verbosity control by voice ("krócej" / "dokładniej") | Verbosity is the most cited complaint; BLV users want both adaptation and manual control (speech rate, verbosity levels like their screen reader). | LOW | 3 levels passed as a prompt parameter; persist in `chrome.storage`. Cheap and demo-able. |
| D6 | Consent/cookie banner handled as a legal consent (asks "tak") | Shows the safety model in the very first seconds of the demo; competitors auto-click. | LOW | Falls out of T9. Pre-set consent before the timed demo, but show the guard once. |
| D7 | Blind-user test findings in the presentation | Differentiator 5; nobody among the hackathon competitors reports it. | N/A (process) | 15-30 min session; assign an owner now (open question in CLAUDE.md). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Automatic page summary on every page load (Diamond) | Feels proactive and helpful | Collides with the screen reader's own page-load announcement; violates "speak only when addressed" and the "short" rule; costs an LLM call on every page. | On demand only: "co tu jest?". |
| Saved-profile autofill of personal data (Diamond) | Saves dictation effort | Puts PESEL/address/IBAN near the model; conflicts with differentiator 4. | Dictate non-sensitive fields; stop at sensitive ones. |
| Cross-site memory / persistent chat history (Screen Agent, Diamond, Wayfinder) | Natural conversation | Privacy cost; CLAUDE.md forbids logging page content or commands; adds state bugs. | Stateless per command plus last-announcement buffer for "powtórz". |
| Always-listening / wake word | Hands-free | Microphone picks up screen-reader speech (known problem; open speakers), false triggers, privacy. | Push-to-talk only. |
| Own high-quality TTS as the primary voice (ElevenLabs etc.) | Pleasant voice | Second voice competing with the screen reader; user cannot tune rate/voice the way they have set it; extra dependency and latency. | ARIA live primary; `speechSynthesis` pl-PL fallback only. |
| Screenshot/vision understanding by default | Handles badly built pages | Privacy leak risk, tokens, latency; contradicts CLAUDE.md priority. | Accessibility tree first; screenshots out of the MVP. |
| Autonomous multi-step "do it all for me" loops | Impressive demo | Best-case CUA success is about 52% on desktop tasks; termination and constraint-tracking failures; unsafe with irreversible actions. | One action per command, effect announced, user decides next. |
| Chatty persona / friend or humour tone | Feels human | "Friend" persona was rated worst (bossy, overbearing) in BLV conversational-reader study; adds words. | Neutral, polite, brief (butler/caregiver tone preferred). |
| Reading the whole page aloud linearly | "Read this page" | That is the screen reader's job; slow, duplicates voices. | Summary + actions; let the screen reader read in full. |
| Auto-accepting cookie banners | Removes friction | It is a legal consent; violates "tak" rule. | Ask once (D6) or let the user pre-set consent. |
| Login/banking flows in the demo | "More impressive" | Passwords, OTP, BLIK: the agent must stop anyway; demo risk is high. | InPost tracking (no login); show the stop behaviour on a mock login page only if time allows. |
| Local/offline LLM, shared label database, multi-browser, Be My Eyes bridge | Listed in scope doc | All explicitly out of scope (CLAUDE.md section 6). | "Co dalej" slide. |
| Always-open visual assistant panel (Screen Agent) | Familiar chat UI | Visual UI is irrelevant for the target user and adds a surface to make accessible. | Voice + minimal options page. |

---

## Feature Dependencies

```
T2 STT (teammate) ---requires---> T1 Push-to-talk + mic permission
T1 ---enhances---> T19 earcons (open/close/working/done)

T3 page description ---requires---> Simplified DOM / a11y tree extraction
T4 actions list     ---requires---> Simplified DOM / a11y tree extraction
T5 click, T6 fill   ---requires---> Simplified DOM with stable element ids
T15 masking         ---requires---> Simplified DOM extraction (masking happens inside it)
Everything sent to the model ---requires---> T15 masking

Model structured proposal (action, target, say, needs_confirmation)
    ---requires---> Backend proxy (key not in extension)
T9 confirmation gate ---requires---> Structured proposal + deterministic policy list
T5/T6 execution ---requires---> T9 gate + T16 hard stops + T17 ambiguity check

T11 effect announcement ---requires---> re-read page state after action
D1 grounded effect ---requires---> T11 + site-specific status extractor (InPost)
T11/T13/T14/T17/T9 prompts ---require---> T12 speech output (ARIA live + fallback) 
T10 barge-in ---requires---> T12 (to cancel speech) + T1 (shortcut) + abort of pending action

T7 read-back ---requires---> T6 fill + T12 + T9-style yes/no listening turn
T17 ambiguity ---requires---> a yes/no/choice listening turn (shared with T9, T7)

D5 verbosity ---enhances---> T3, T4, T11 (prompt parameter)
D3 privacy debug view ---requires---> T15 masking

D2 single-voice guarantee ---conflicts---> speaking via both ARIA live and speechSynthesis simultaneously
Always-listening ---conflicts---> screen reader speech (mic pickup)
Auto page summary ---conflicts---> "speak only when addressed" + screen reader page-load speech
```

### Dependency Notes

- **A shared "listen for short answer" turn** (yes/no/choice) underlies T7, T9, T17. Build it once, early; it is the backbone of the safety story.
- **Speech output (T12) is a prerequisite for almost everything user-visible.** Build and test with NVDA in the first phase, not at the end.
- **Masking must live inside DOM extraction**, not as a post-filter on the model payload, so no code path can bypass it.
- **D1 depends on a site-specific extractor.** For a single scenario this is cheap and is what makes the demo reliable; keep the generic path as fallback.
- **Plan B (mock InPost page / canned responses)** depends on the structured-proposal format being fixed, so canned responses can replay through the same executor.

---

## What blind users complain about with such agents (evidence)

| Complaint | Evidence | Confidence | Design response |
|-----------|----------|------------|-----------------|
| **Too verbose; one-size-fits-all output** | BLV generative-AI study (arXiv 2609.15696): outputs "too verbose", want customizable length and format. Shopping-agent study: prefer tightly constrained interactions, name/price/rating first, max 3 options. | MEDIUM | 1-2 sentences default, D5, T4 caps. |
| **Cannot verify output; confident hallucination; never fully trust** | Same studies; users verify by re-asking, other models, or sighted help. Be My AI users report hallucination and misread intent (study of 14 users). | MEDIUM | D1 grounded quotes, "pokaż źródło", T11. |
| **Need double-checks before irreversible actions** (voice leaves no visual record) | Shopping-agent study: users "repeatedly requested double-checks before adding items to the cart"; unresolved trust about delegating payment. | MEDIUM | T7, T9, D6. |
| **Agents fail often and do not know when to stop** | CUA diary study, 8 blind users, 1,258 commands: best success 52.5%; grounding, planning, constraint-tracking, termination failures. | MEDIUM | T17, T18; short utterance-level steps. |
| **Voice collisions**: agent voice vs. screen reader; screen reader speech leaking into mic | Orca/WebAIM/JAWS support threads: ambient mic picks up screen-reader speech; fix is headset. Live regions: JAWS treats all as polite, NVDA alert re-announces interrupted text, hidden regions never announce, dynamically injected regions miss first announcement (Roselli 2026). | MEDIUM | PTT only, headset in demo, D2 (pre-rendered, visually-hidden-not-`display:none` live region), no dual voice. |
| **Wants both adaptation and manual control** (speech rate, voice, verbosity) | Conversational-screen-reader study: three control tiers (granular, summary, delegate tasks); want settings "similar to current screen readers". | MEDIUM | D5; keep settings minimal but present (T20). |
| **Tone**: bossy/overbearing persona disliked | Same study (Friend persona least preferred by 8 participants). | MEDIUM | Neutral, polite, brief wording; no jokes. |
| **Privacy anxiety** about personal info and retention | BLV generative-AI study. | MEDIUM | T15, D3, no logging. |
| **Captcha** is a top web hurdle | WebAIM screen-reader survey (as summarised in search results). | MEDIUM | T16 stop + human-help message. |
| Latency / silence feels like failure | General voice-UI practice; not directly measured in sources above. | LOW | T19. |

Not found: evidence specific to Polish blind users or Polish e-service pain points (search returned nothing). This is the exact gap the blind-user session (D7) should fill; add 3-4 targeted questions (which screen reader and voice, how they check parcels today, how they feel about cookie banners, preferred verbosity).

---

## MVP Definition

### Launch With (v1, the 24h demo)

Ordered roughly by build sequence (vertical slice first):

- [ ] T12 speech output via ARIA live + fallback, tested with NVDA — everything else depends on it
- [ ] T1 + T2 push-to-talk and Polish transcription integration; T19 earcons
- [ ] DOM/a11y-tree extraction with T15 masking built in
- [ ] Backend proxy + structured action proposal + validator (T9 policy, T16 stops)
- [ ] T6 fill + T7 read-back, T5 click, T11 effect announcement for the InPost flow ("sprawdź status przesyłki numer ...")
- [ ] D1 grounded InPost status extractor (deterministic) with generic fallback
- [ ] T10 stop/barge-in, T13 errors, T14 powtórz
- [ ] T3 "co tu jest?", T4 "co mogę zrobić?", T8 scroll, T17 ambiguity
- [ ] T20 minimal keyboard-accessible options; T21 Polish numbers
- [ ] Plan B: mock InPost page + canned responses through the same executor

### Add If Time Allows (still in the 24h)

- [ ] D5 "krócej / dokładniej" — cheap, addresses top complaint
- [ ] D3 local "what was sent to the model" debug view, plus mock login/payment page for Network-tab proof
- [ ] D6 cookie-consent guard demo moment
- [ ] Text-command input as fallback when STT fails (also Plan B for noisy rooms)
- [ ] Navigation by headings/links ("przeczytaj nagłówki")

### Future Consideration (post-hackathon, "co dalej" slide)

- [ ] More Polish services (e-urząd, banks, Poczta Polska, DPD/DHL), per-site extractors
- [ ] Shared label database for unlabeled elements
- [ ] Screenshot fallback with masking for badly built pages
- [ ] Local/offline model, multi-browser, mobile
- [ ] Be My Eyes hand-off at captcha
- [ ] Per-user adaptive verbosity learned over time

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| T12 ARIA live + fallback | HIGH | MEDIUM | P1 |
| T1/T2 PTT + STT | HIGH | MEDIUM | P1 |
| T15 masking | HIGH | MEDIUM | P1 |
| T9 confirmation gate | HIGH | MEDIUM | P1 |
| T11 effect announcement | HIGH | MEDIUM | P1 |
| D1 grounded InPost status | HIGH | MEDIUM | P1 |
| T7 read-back of number | HIGH | LOW | P1 |
| T5/T6 click, fill | HIGH | MEDIUM | P1 |
| T10 barge-in | HIGH | MEDIUM | P1 |
| T16 hard stops | HIGH | LOW | P1 |
| T13 errors, T14 powtórz, T19 earcons | HIGH | LOW | P1 |
| T3/T4 describe, list actions | HIGH | MEDIUM | P1 |
| T17 ambiguity | MEDIUM | MEDIUM | P1 (bounded to max 3 options) |
| T18 bounded steps | MEDIUM | LOW | P1 |
| T20 accessible extension UI | HIGH | LOW-MEDIUM | P1 |
| T21 Polish numbers | MEDIUM | LOW-MEDIUM | P1 |
| T8 scroll | MEDIUM | LOW | P1 |
| D5 verbosity voice command | HIGH | LOW | P2 |
| D3 privacy debug view | MEDIUM | LOW-MEDIUM | P2 |
| D6 cookie consent guard | MEDIUM | LOW | P2 |
| Text-command fallback | MEDIUM | LOW | P2 |
| Headings/links navigation | MEDIUM | MEDIUM | P3 |
| D7 blind-user test | HIGH | LOW (but scheduling) | P1 (process) |

**Priority key:** P1 = must have for demo; P2 = should have, add when possible; P3 = nice to have.

---

## Competitor Feature Analysis

| Feature | Diamond Access AI | Wayfinder | Navable / Screen Agent | Our Approach |
|---------|-------------------|-----------|------------------------|--------------|
| Voice input | Alt+D push-to-talk | ElevenLabs STT | Voice or text / voice-first | PTT, Whisper pl, avoid Alt+D |
| Voice output | Browser TTS | ElevenLabs voice | ARIA live (Navable), TTS options | ARIA live primary, speechSynthesis fallback, no double voice |
| Page understanding | Auto summary each load | DOM + a11y tree | Page structure scan | On-demand summary from simplified tree |
| Actions | Click, navigate, fill, compare | Full browser-use actions | Scroll, list headings, forms | Click, fill, scroll, one step per command |
| Irreversible actions | Safety confirmation | Not documented | Not documented | Deterministic policy + spoken "tak" |
| Sensitive data | Saved-profile autofill | Uses logged-in sessions | Passwords excluded from summaries (Navable) | Masked at extraction; verifiable in Network tab |
| Effect verification | Not documented | Conversational results | Not documented | Grounded DOM quote after every action |
| Language | English | English | English | Polish, Polish sites and number speech |
| User testing | Not documented | Not documented | Pilot study (Screen Agent) | Blind user session, reported in the pitch |

---

## Sources

- Diamond Access AI submission, lablab.ai — https://lablab.ai/submissions/oyjzcfnebaiha5d9vy2upg9s (MEDIUM; hackathon submission page)
- Wayfinder, AI Tinkerers hackathon entry (via search summaries; page itself returned 403) — https://amsterdam.aitinkerers.org/hackathons/h_AUrIIiOrRa8/entries/ht_vdUp-NixPy0 (LOW-MEDIUM)
- Screen Agent, CUNY BMCC — https://openlab.bmcc.cuny.edu/research-and-scholarship/2026/05/14/screen-agent-a-voice-first-browser-extension-for-accessible-web-navigation-using-local-ai/ (MEDIUM)
- Navable listing — https://chromeboard.com/extension/navable-lapecmilebnkokdmalllemokflkhgcpl (MEDIUM)
- Vision Assistant Pro, AppleVis announcement thread (via search summaries; page returned 403) — https://applevis.com/forum/windows/new-add-vision-assistant-pro-your-interactive-ai-copilot-nvda-powered-gemini (LOW-MEDIUM)
- ScreenGuardian, Devpost mirror (search summary only) — https://backiee.wasmer.app/https_devpost_com/software/screenguardian (LOW)
- JAWS Picture Smart / FSCompanion — https://support.freedomscientific.com/About/News/Article/227 , https://nelowvision.com/picturesmart-ai-for-jaws-screen-reader/ (MEDIUM, summaries)
- "More Than Just Access: Generative AI as Communication Intermediary for BLV Users" — https://arxiv.org/pdf/2609.15696 (MEDIUM; read via fetch summary)
- "Are We There Yet? Assessing Computer-Use Agents for Blind Users' Accessible Interaction with Desktop Applications" — https://arxiv.org/abs/2609.00524 (MEDIUM; abstract-level, figures from fetch summary)
- "Toward Independent Online Shopping of the Visually Impaired Through Voice-based Computer-Using Agent" — https://a11y-paradise.onrender.com/reviews/69e63e5f5570d11947cedf8f (MEDIUM; review/summary page)
- "Speaking with My Screen Reader: Audio Fictions to Explore Conversational Access to Interfaces" (persona and control findings, via fetch summary) — https://a11y-paradise.onrender.com/reviews/69b2c1ace752f0eb21e1d248 (MEDIUM)
- "Beyond Visual Perception: Insights from Smartphone Interaction of Visually Impaired Users with LMMs" (Be My AI hallucination findings) — https://arxiv.org/html/2502.16098v1 (MEDIUM, snippet only)
- Adrian Roselli, "Live Region Support" (Jan 2026) — https://adrianroselli.com/2026/01/live-region-support.html (HIGH for live-region behaviour; recognised practitioner testing)
- Screen reader audio leaking into microphones (Orca list, Freedom Scientific/other threads) — https://lists.gnome.org/archives/orca-list/2022-July/msg00152.html (MEDIUM)
- WebAIM screen reader survey coverage — https://doubletaponair.com/webaim-survey-results-shows-increase-in-nvda-users-on-pc-and-ios-remains-most-popular-smartphone-in-blind-community/ (MEDIUM)
- InPost tracking page (fetch summary): input accepts comma-separated numbers (up to 5), 24-character example, "Znajdź" button, cookie banner, skip links, no captcha mentioned — https://inpost.pl/sledzenie-przesylek (LOW-MEDIUM; **re-verify manually in a real browser**, including result-page markup for the D1 extractor)

Not verified: AriaPilot (no results). Claims about `chrome.commands` having no keyup event, Alt+D = Chrome address bar, and mic-permission handling from content scripts come from my own knowledge and should be spiked or confirmed against Chrome docs by the stack/architecture researcher.

---
*Feature research for: voice/agent accessibility extension for blind users (Polish services)*
*Researched: 2026-10-03*
