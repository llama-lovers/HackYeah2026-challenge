---
phase: 03
review: 03-REVIEW.md
titles: json
findings:
  - id: WR-01
    severity: warning
    disposition: open
    title: "Closing the tab during recording leaves the microphone open and still uploads the audio"
  - id: WR-02
    severity: warning
    disposition: open
    title: "The new `page_exploration` schema is never warmed up, so the first \"co tu jest?\" in the demo pays the grammar-compile latency"
  - id: WR-03
    severity: warning
    disposition: open
    title: "The untrusted-data fence is bypassed by case or whitespace variants of the closing tag"
  - id: WR-04
    severity: warning
    disposition: open
    title: "The effect-expiry timer is in-memory only, so a worker restart can leave the user in silence"
  - id: IN-01
    severity: info
    disposition: open
    title: "Any extension context can forge offscreen events"
  - id: IN-02
    severity: info
    disposition: open
    title: "A new snapshot or pending question can be silently destroyed by a command in another tab"
  - id: IN-03
    severity: info
    disposition: open
    title: "Scroll range uses `innerHeight` instead of `clientHeight`"
  - id: IN-04
    severity: info
    disposition: open
    title: "Failure categories and dead code"
  - id: IN-05
    severity: info
    disposition: open
    title: "Phrase normalization is duplicated and inconsistent"
  - id: IN-06
    severity: info
    disposition: open
    title: "Hard cap mismatch between client and server snapshot size, and tier caps duplicated by hand"
  - id: IN-07
    severity: info
    disposition: open
    title: "`exploration.mjs` leaves monkey-patches installed when an assertion fails"
open: 11
total: 11
recorded: 2026-10-04T00:00:44.506Z
---

# Phase 03: Code Review Disposition

| Finding | Severity | Disposition | Source |
|---------|----------|-------------|--------|
| WR-01 | warning | open | - |
| WR-02 | warning | open | - |
| WR-03 | warning | open | - |
| WR-04 | warning | open | - |
| IN-01 | info | open | - |
| IN-02 | info | open | - |
| IN-03 | info | open | - |
| IN-04 | info | open | - |
| IN-05 | info | open | - |
| IN-06 | info | open | - |
| IN-07 | info | open | - |

Dispositions: `open` (recorded, not yet triaged), `fixed`, `skipped`, `deferred`.
Set `deferred` by hand and put the reason in the Source cell; both are preserved. A `|` in the reason is kept as prose and escaped on the next run.
Re-running the gate keeps every row it can. A row the current review no longer reports is kept and its Source cell flagged, so a finding does not leave this record silently. ONE exception: when a finding id is REUSED by a different finding, the earlier decision cannot keep a row — the id is taken — and it is dropped. A RECORDED decision (anything but `open`) is named on the console when that happens; a row still at `open` is replaced silently, because `open` records no decision to lose.
