---
status: testing
phase: 03-page-exploration-conversation
source: [03-VERIFICATION.md]
started: 2026-10-04T02:35:00Z
updated: 2026-10-04T02:35:00Z
---

## Current Test

number: 1
name: H1 exact repeat audibly spoken (OUT-03)
expected: |
  'co tu jest?' then 'powtórz' twice: the same answer is heard three times through the screen reader, no chrome.tts voice.
awaiting: user response

## Tests

### 1. H1 exact repeat audibly spoken (OUT-03)
expected: 'co tu jest?' then 'powtórz' twice: the same answer is heard three times through the screen reader, no chrome.tts voice.
result: [pending]

### 2. H2 real Alt+Shift+A grants activeTab on an ordinary HTTPS page (PAGE-02, PAGE-03)
expected: Ordinary page: recording starts, answer spoken. chrome:// page and Web Store: 'Tej strony nie obsługuję...' and no recording.
result: [pending]

### 3. H3 verbosity survives a real browser restart (OUT-04)
expected: After quitting and restarting the whole browser with the same profile the chosen level still applies, and 'powtórz' says there is nothing to repeat.
result: [pending]

### 4. H4 live-model Polish quality (PAGE-02, PAGE-03, OUT-04)
expected: Summaries grounded; action lists only controls that exist and within 3/4/5; concise level never reads as dropping a warning.
result: [pending]

### 5. H5 eight-second notice in a genuinely slow turn (OUT-07)
expected: 'To trwa dłużej niż zwykle' heard once about 8 s after stop; 'powtórz' repeats the answer, not the notice.
result: [pending]

### 6. H6 audible error recovery (OUT-08)
expected: Proxy stopped, mic covered, no API key: each gives short Polish with a next step, never silence.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps
