---
schema_version: 1
open_count: 13
waived_count: 0
fixed_count: 0
total_count: 13
last_updated: 2026-10-03T23:41:02.066Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 01 | unrun-verify | server/app/openrouter.py |  | Live OpenRouter schema/latency/reasoning verification pending real API key | open |  | 2026-10-03T13:14:49.004Z |  |
| 2 | 01 | unrun-verify | server/app/stt.py |  | Real Whisper audio/webm microphone smoke pending teammate module and API key | open |  | 2026-10-03T13:14:49.209Z |  |
| 3 | 01 | stub | server/app/stt.py | 13 | Intentional D-13 STT stub; real Whisper module is teammate-owned and absent | open |  | 2026-10-03T13:14:49.448Z |  |
| 4 | 01 | unrun-verify | extension/static/options.html |  | Clean-profile microphone grant and NVDA/VoiceOver live-region speech require the Windows/macOS end-of-phase human check. | open |  | 2026-10-03T14:03:33.014Z |  |
| 5 | 01 | unrun-verify | extension/src/content/live-region.ts |  | NVDA/VoiceOver speech of ordered and identical consecutive messages in browse mode and with parcel-field focus is pending real screen-reader testing. | open |  | 2026-10-03T14:32:27.279Z |  |
| 6 | 01 | unrun-verify | extension/e2e/scenarios/privacy.mjs |  | DevTools Network-tab masking proof on the sensitive fixture and live InPost parcel page is pending end-of-phase human review. | open |  | 2026-10-03T14:32:27.499Z |  |
| 7 | 01 | unrun-verify | extension/src/background/pipeline.ts |  | Live InPost fill/search/navigation with real provider Polish effect quality and total latency is pending an API key and human review. | open |  | 2026-10-03T14:32:27.729Z |  |
| 8 | 02 | unrun-verify | extension/src/shared/messages.pl.ts |  | NVDA must verify complete Polish numbered option lists, contextual confirmation and trusted-person secret/captcha refusals. | open |  | 2026-10-03T19:54:17.404Z |  |
| 9 | 02 | unrun-verify | server/app/schemas.py |  | Real pinned OpenRouter model choose schema and ambiguous live InPost commands remain unverified offline (also covered by WINDOWS entry 1). | open |  | 2026-10-03T19:54:17.652Z |  |
| 10 | 03 | unrun-verify | .planning/phases/03-page-exploration-conversation/03-ACCEPTANCE.md |  | H1/H5/H6: audible NVDA or VoiceOver check of exact repeat, eight-second notice and error recovery pending (DOM write is not audible delivery) | open |  | 2026-10-03T23:41:01.369Z |  |
| 11 | 03 | unrun-verify | .planning/phases/03-page-exploration-conversation/03-ACCEPTANCE.md |  | H2: real Alt+Shift+A activeTab grant on an ordinary HTTPS page and honest recovery on chrome:// and the Web Store pending | open |  | 2026-10-03T23:41:01.615Z |  |
| 12 | 03 | unrun-verify | .planning/phases/03-page-exploration-conversation/03-ACCEPTANCE.md |  | H3: verbosity persistence across a real same-profile browser restart on the demo machine pending | open |  | 2026-10-03T23:41:01.841Z |  |
| 13 | 03 | unrun-verify | .planning/phases/03-page-exploration-conversation/03-ACCEPTANCE.md |  | H4: live-model Polish summary and action quality at each verbosity tier pending (fake provider only proves the contract) | open |  | 2026-10-03T23:41:02.066Z |  |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "server/app/openrouter.py",
    "line": null,
    "description": "Live OpenRouter schema/latency/reasoning verification pending real API key",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T13:14:49.004Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 2,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "server/app/stt.py",
    "line": null,
    "description": "Real Whisper audio/webm microphone smoke pending teammate module and API key",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T13:14:49.209Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 3,
    "kind": "stub",
    "phase": "01",
    "file": "server/app/stt.py",
    "line": 13,
    "description": "Intentional D-13 STT stub; real Whisper module is teammate-owned and absent",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T13:14:49.448Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 4,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "extension/static/options.html",
    "line": null,
    "description": "Clean-profile microphone grant and NVDA/VoiceOver live-region speech require the Windows/macOS end-of-phase human check.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T14:03:33.014Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 5,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "extension/src/content/live-region.ts",
    "line": null,
    "description": "NVDA/VoiceOver speech of ordered and identical consecutive messages in browse mode and with parcel-field focus is pending real screen-reader testing.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T14:32:27.279Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 6,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "extension/e2e/scenarios/privacy.mjs",
    "line": null,
    "description": "DevTools Network-tab masking proof on the sensitive fixture and live InPost parcel page is pending end-of-phase human review.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T14:32:27.499Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 7,
    "kind": "unrun-verify",
    "phase": "01",
    "file": "extension/src/background/pipeline.ts",
    "line": null,
    "description": "Live InPost fill/search/navigation with real provider Polish effect quality and total latency is pending an API key and human review.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T14:32:27.729Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 8,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "extension/src/shared/messages.pl.ts",
    "line": null,
    "description": "NVDA must verify complete Polish numbered option lists, contextual confirmation and trusted-person secret/captcha refusals.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T19:54:17.404Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 9,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "server/app/schemas.py",
    "line": null,
    "description": "Real pinned OpenRouter model choose schema and ambiguous live InPost commands remain unverified offline (also covered by WINDOWS entry 1).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T19:54:17.652Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 10,
    "kind": "unrun-verify",
    "phase": "03",
    "file": ".planning/phases/03-page-exploration-conversation/03-ACCEPTANCE.md",
    "line": null,
    "description": "H1/H5/H6: audible NVDA or VoiceOver check of exact repeat, eight-second notice and error recovery pending (DOM write is not audible delivery)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T23:41:01.369Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 11,
    "kind": "unrun-verify",
    "phase": "03",
    "file": ".planning/phases/03-page-exploration-conversation/03-ACCEPTANCE.md",
    "line": null,
    "description": "H2: real Alt+Shift+A activeTab grant on an ordinary HTTPS page and honest recovery on chrome:// and the Web Store pending",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T23:41:01.615Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 12,
    "kind": "unrun-verify",
    "phase": "03",
    "file": ".planning/phases/03-page-exploration-conversation/03-ACCEPTANCE.md",
    "line": null,
    "description": "H3: verbosity persistence across a real same-profile browser restart on the demo machine pending",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T23:41:01.841Z",
    "resolved_at": null,
    "milestone": null
  },
  {
    "id": 13,
    "kind": "unrun-verify",
    "phase": "03",
    "file": ".planning/phases/03-page-exploration-conversation/03-ACCEPTANCE.md",
    "line": null,
    "description": "H4: live-model Polish summary and action quality at each verbosity tier pending (fake provider only proves the contract)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-03T23:41:02.066Z",
    "resolved_at": null,
    "milestone": null
  }
]
````
