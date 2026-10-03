---
schema_version: 1
open_count: 4
waived_count: 0
fixed_count: 0
total_count: 4
last_updated: 2026-10-03T14:03:33.014Z
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
  }
]
````
