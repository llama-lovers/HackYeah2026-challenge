# Phase 3 end-of-phase acceptance (human checks)

Status of every item below: **PENDING**. Nothing here has been observed. Automated runs (fake provider, headless Chromium, DOM
mutations) are not evidence of audible speech, a genuine `activeTab` grant, or live-model quality. Record each result as
`pass`, `fail` or `blocked` with date, machine, browser version and screen reader version.

Preconditions: demo machine, current Chrome stable, extension built with `npm --prefix extension run build` and loaded unpacked,
proxy running with a real `OPENROUTER_API_KEY` and the real Whisper module, NVDA (Windows) or VoiceOver (macOS) running.

| # | Check | Procedure | Pass condition | Result |
|---|-------|-----------|----------------|--------|
| H1 | Exact repeat is audibly spoken twice (OUT-03) | Open any ordinary page, say "co tu jest?", wait for the answer, then say "powtórz" twice. | The same answer is heard three times in total as separate utterances, through the screen reader, with no fallback (`chrome.tts`) voice. | pending |
| H2 | Real shortcut grants `activeTab` (PAGE-02, PAGE-03) | On an ordinary HTTPS page outside the manifest's declarative matches, press the real Alt+Shift+A command and speak. Then press it on `chrome://extensions` and on the Chrome Web Store. | Ordinary page: recording starts and the answer is spoken. `chrome://` page and the Web Store: the honest "Tej strony nie obsługuję..." recovery is heard and no recording starts. | pending |
| H3 | Verbosity survives a real browser restart (OUT-04) | Say "krócej" (or "dokładniej") until a non-default level is announced. Quit the whole browser, start it with the same profile, open a page, say "co tu jest?". Then say "powtórz". | The answer follows the chosen level; "powtórz" says there is nothing to repeat (replay did not survive). | pending |
| H4 | Live-model Polish quality (PAGE-02, PAGE-03, OUT-04) | With real credentials, say "co tu jest?" and "co mogę zrobić?" on inpost.pl tracking and on one other Polish site, at each verbosity level. | Summaries are grounded in the page and useful; action lists name only controls that exist on the page and stay within 3/4/5 items; the concise level never reads as dropping a warning. | pending |
| H5 | Eight-second notice timing in a real slow turn (OUT-07) | Throttle the network (or use a slow provider), say a command that takes longer than eight seconds. | "To trwa dłużej niż zwykle" is heard once, about eight seconds after the shortcut is pressed to stop recording, and the answer follows; "powtórz" repeats the answer, not the notice. | pending |
| H6 | Error recovery is audible and useful (OUT-08) | Stop the proxy, speak a command; cover or unplug the microphone, press the shortcut; speak with the proxy running but no API key. | Each failure is spoken in short Polish with a concrete next step, never silence. | pending |
| P1 | Phase 1 carry-over: clean-profile microphone grant | Fresh Chrome profile, load extension, grant microphone on the options page, record. | Recording works; permission persists. | pending (Phase 1) |
| P2 | Phase 1 carry-over: shortcut and live-region delivery | With NVDA/VoiceOver, press the shortcut and speak a command on inpost.pl. | Status lines are spoken by the screen reader through the live region. | pending (Phase 1) |
| P3 | Phase 1 carry-over: Network masking | DevTools Network tab on a page with a password field; speak a command. | No sensitive value appears in any request to the proxy. | pending (Phase 1) |
| P4 | Phase 1 carry-over: live provider | Real Whisper and OpenRouter keys; run the InPost tracking scenario. | End-to-end parcel status is spoken. | pending (Phase 1) |

Phase 1 verification stays **pending** until P1-P4 pass; completing Phase 3 does not change that status.

Known limitation to observe in H1/H2: an `ANNOUNCE` interrupted by a navigation after the write but before the acknowledgement
falls back to `chrome.tts`, so that line may be heard twice (recorded in 03-02-SUMMARY).
