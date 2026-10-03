---
phase: 01-voice-to-effect-vertical-slice
reviewed: 2026-10-03T14:50:37Z
depth: standard
files_reviewed: 63
files_reviewed_list:
  - .gitignore
  - extension/e2e/cdp.mjs
  - extension/e2e/dom-check.mjs
  - extension/e2e/scenarios/effect.mjs
  - extension/e2e/scenarios/navigation.mjs
  - extension/e2e/scenarios/onboarding.mjs
  - extension/e2e/scenarios/privacy.mjs
  - extension/e2e/scenarios/refusals.mjs
  - extension/e2e/scenarios/tracer.mjs
  - extension/e2e/scenarios/turns.mjs
  - extension/e2e/scenarios/wav.mjs
  - extension/e2e/smoke.mjs
  - extension/package.json
  - extension/scripts/build.mjs
  - extension/scripts/gen-key.mjs
  - extension/src/background/index.ts
  - extension/src/background/pipeline.ts
  - extension/src/background/proxy.ts
  - extension/src/content/executor.ts
  - extension/src/content/index.ts
  - extension/src/content/live-region.ts
  - extension/src/content/settle.ts
  - extension/src/content/snapshot.ts
  - extension/src/env.d.ts
  - extension/src/offscreen/offscreen.ts
  - extension/src/options/options.ts
  - extension/src/shared/diff.test.ts
  - extension/src/shared/diff.ts
  - extension/src/shared/mask.test.ts
  - extension/src/shared/mask.ts
  - extension/src/shared/messages.pl.test.ts
  - extension/src/shared/messages.pl.ts
  - extension/src/shared/protocol.ts
  - extension/src/shared/snapshot-format.test.ts
  - extension/src/shared/snapshot-format.ts
  - extension/src/shared/turn.test.ts
  - extension/src/shared/turn.ts
  - extension/src/shared/validate.test.ts
  - extension/src/shared/validate.ts
  - extension/src/shared/wav.test.ts
  - extension/src/shared/wav.ts
  - extension/static/manifest.json
  - extension/static/offscreen.html
  - extension/static/options.html
  - extension/tsconfig.json
  - server/.env.example
  - server/app/__init__.py
  - server/app/config.py
  - server/app/main.py
  - server/app/middleware.py
  - server/app/openrouter.py
  - server/app/prompts.py
  - server/app/schemas.py
  - server/app/stt.py
  - server/fixtures/sensitive.html
  - server/fixtures/szukaj.html
  - server/fixtures/tracking-form.html
  - server/pyproject.toml
  - server/tests/conftest.py
  - server/tests/fake_openrouter.py
  - server/tests/test_action.py
  - server/tests/test_seams.py
  - server/tests/test_security.py
findings:
  critical: 10
  warning: 2
  info: 0
  total: 12
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-10-03T14:50:37Z
**Depth:** standard
**Files Reviewed:** 63
**Status:** issues_found

## Summary

Reviewed the explicit Phase 01 diff scope, including production modules, fixtures, build scripts and test reliability, against the phase plans/summaries and project privacy/action rules. Excluded the two dependency lockfiles. No AGENTS.md, .codexignore or project skill indexes were present. Structural prepass and external reviewer lanes were not supplied.

Ten BLOCKER findings concern information disclosure, unsafe execution, competing turns, unsupported navigation and false effect attribution. Two WARNING findings weaken the browser harness's ability to isolate and prove a turn. Several defects reproduce in targeted executions of the actual source modules with controlled Chrome/DOM adapters; these probes do not establish real browser or screen-reader behavior.

The supplied 53 server tests, 78 extension tests and 8/8 Chromium scenarios remain evidence for their tested fixtures. Their success does not cover the adversarial cases below. Genuine NVDA/VoiceOver speech, clean-profile microphone permission/capture, live InPost and live OpenRouter/Whisper acceptance remain pending. The explicitly planned STT stub and deferred confirmation/barge-in features are not reported as defects. The 24-digit parcel positive control that contains the invalid PESEL canary as a prefix is legitimate; no finding relies on that substring.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Adjacent numeric tokens bypass the checksum masker

**Classification:** BLOCKER
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/shared/mask.ts:23-30`
**Related:** `extension/src/content/snapshot.ts:12`, `extension/src/background/proxy.ts:8-14`
**Issue:** RUN greedily treats any digits separated by one space/hyphen as a single number. A valid PESEL beside another numeric token becomes a 20- or 22-digit run, fails all three length checks, and is returned unchanged. Direct execution produced unchanged outputs for both `PESEL 44051401359 600100200` and `44051401359 44051401359`, while the standalone PESEL was masked. Visible page text, accessible names and dictated commands containing these tokens reach /api/action; assertEgressClean repeats the same defective masker and accepts the leak.
**Fix:** Tokenize standalone numbers separately from recognized grouping formats, apply checksums to complete number tokens, and apply sensitive-context masking where a grouping is ambiguous. Preserve explicit 8/24-digit parcel tokens rather than scanning their substrings. Add regression cases for adjacent PESEL/card/telephone values and retain the parcel-prefix positive controls.

### CR-02: Text aggregation and field metadata bypass sensitive-value masking

**Classification:** BLOCKER
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/content/snapshot.ts:66-69`
**Related:** `extension/src/content/snapshot.ts:90-96,119-124,132-139`
**Issue:** Only an interactive node's value receives field-signal masking. visibleText recursively reads textarea text, and computeName reads referenced textContent without excluding sensitive controls. The heading/live-container branches aggregate this text and return before walking the child control. For example, `<div role="status"><textarea autocomplete="current-password">Tajne!Haslo1</textarea></div>` emits an alert containing the password. A password input whose aria-label contains its value emits that value in name even though value is [ukryte]. Both cases reproduced with the actual snapshot module on a controlled DOM adapter. Alphanumeric passwords and short OTP/CVV values do not match maskText, so the egress assertion cannot catch them.
**Fix:** Make all text/name extraction exclude form-control values, including referenced labels and aggregate alert/heading text. Gather sensitive field values before text extraction and scrub their occurrences from emitted metadata/text where the page echoes them; apply contextual masking to short secret values. Test these cases on real DOM fixtures and inspect both action and effect payloads.

### CR-03: Irreversible clicks pass the local safety floor under common Polish labels

**Classification:** BLOCKER
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/shared/validate.ts:7,23-25`
**Related:** `extension/src/content/snapshot.ts:161-165`
**Issue:** With needs_confirmation=false, a visible enabled type=button named `Potwierdź płatność` or `Zapisz zmiany`, and a legal-consent checkbox named `Wyrażam zgodę na regulamin`, all pass validateProposal. These exact names reproduced as ok click. The submit fallback catches only native submit/image controls, and exempts every GET/search/tracking-class form based on page-controlled hints. Thus model mistakes or hostile page text can bypass the Phase 01 rule that the extension itself refuses irreversible operations, regardless of the model's flag.
**Fix:** Add explicit payment/account-change/consent signals and classify associated forms and controls, not only selected verbs. Limit lookup exemptions to positively identified lookup operations. For this narrow slice, allow known safe lookup actions and reject uncertain side effects with the existing confirmation-required sentence; no confirmation UI needs to be added. Test these ordinary labels, JS buttons, consent checkboxes and disguised search/GET forms.

### CR-04: Synchronous focus handlers can invalidate policy before the native fill

**Classification:** BLOCKER
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/content/executor.ts:20-32`
**Issue:** The last policy check happens before element.focus(). Focus synchronously runs the page's focus/focusin handlers, which may change type to password, add one-time-code autocomplete, disable/remove the field, or change maxlength. The native setter then writes without resolving or validating again. A targeted executor probe with a focus handler changing sensitivity recorded a write with sensitive=true and an ok fill result. The 300 ms recheck does not close this later window.
**Fix:** After focus, resolve and validate the same target again, verify connection, identity and supported element/input type, and only then call the native setter. Return a refusal when focus changes any protected condition. Add a browser regression where focus changes a normal lookup input into a password/OTP input and verify its value stays unchanged.

### CR-05: Concurrent shortcut handlers overwrite the recording owner

**Classification:** BLOCKER
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/background/pipeline.ts:52-69`
**Related:** `extension/src/background/index.ts:3-5`, `extension/src/offscreen/offscreen.ts:48-50`
**Issue:** Reading the turn, pinging the tab and storing the next state are separate awaited operations with no serialization. Two rapid commands can both read idle, both pass ping and both send REC_START. The offscreen recorder ignores the second start, while the worker's last storage write changes the owner, potentially to another tab. A Promise.all probe of the actual pipeline produced two REC_START messages and owner tab 22 after starts for tabs 7 and 22. The next press and resulting transcript therefore no longer represent the user's intended start/stop sequence.
**Fix:** Serialize shortcut state transitions and other state-changing events in one queue; reserve the recording owner before asynchronous setup and confirm start success against that reservation. Use a turn ID so setup failures cannot reset a later turn. Add rapid double-toggle and two-tab concurrency tests.

### CR-06: Stale recovery and delayed events have no turn identity or cancellation

**Classification:** BLOCKER
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/background/pipeline.ts:73-87`
**Related:** `extension/src/shared/turn.ts:3-8`, `extension/src/shared/protocol.ts:13-14`, `extension/src/offscreen/offscreen.ts:14-24`, `extension/src/background/pipeline.ts:124`
**Issue:** Offscreen messages carry no recording/turn ID, and every event reads the current session turn. Recovery after 30 seconds starts a new turn without aborting an old capture/upload/model request. This can happen within supported timeouts: manual stop retains the recording start time, while upload permits 25 seconds and the later action/settle/effect stages permit another 38 seconds. An old transcript then snapshots and acts on the new turn's tab; old errors/finally blocks reset the replacement turn. A pipeline probe delivered an old transcript while tab 22 owned a replacement recording and observed SNAPSHOT directed at tab 22. READY cleanup also compares only tabId, so it can reset a newer turn on the same tab.
**Fix:** Carry an immutable turn ID through REC_START/STOP, every offscreen event, EXECUTE and the pending job. Ignore replies whose ID/phase no longer owns the operation; reset conditionally by ID. Refresh the processing deadline when recording stops, and explicitly cancel/acknowledge old capture, uploads and requests before stale recovery permits a replacement. Test late transcript/error/action/effect replies after recovery, including same-tab replacement.

### CR-07: Navigation jobs announce actions that never executed

**Classification:** BLOCKER
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/background/pipeline.ts:104-111`
**Related:** `extension/src/background/pipeline.ts:119-130`, `extension/src/content/executor.ts:17-28`
**Issue:** A job is stored from the unvalidated proposal before EXECUTE reaches the content script or finishes its announcement delay. Any new-document READY for that tab claims it as an executed action. User navigation/reload during this window, or a delivery failure followed by reload, can therefore produce `Kliknąłem…` or `Wpisałem…` even though no action occurred; the proposal may even have named a target the executor would reject. The actual pipeline probe threw on EXECUTE without clicking, then supplied READY and received `Kliknąłem Szukaj, ale na stronie nic się nie zmieniło.`
**Fix:** Distinguish a proposed job from an executed job. Have the content executor send an execution marker with the turn/document/action identity immediately after actually invoking the side effect, while ordinary navigation teardown has not yet completed; do not treat a pre-action acknowledgment as execution evidence. Only proven executed jobs qualify for navigation effect recovery. If the marker is lost or execution is uncertain, report uncertainty without asserting a click/fill. Test manual reload during the pre-line delay and EXECUTE delivery failure followed by READY.

### CR-08: Every EXECUTE transport failure becomes an unbounded silent handoff

**Classification:** BLOCKER
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/background/pipeline.ts:109-112`
**Related:** `extension/src/background/pipeline.ts:87,121-125`, `extension/static/manifest.json:30-41`
**Issue:** The catch returns handoff for all message failures, including a closed tab, removed content script, unsupported destination, and action=none where no job exists. The caller consequently retains processing and gives no failure announcement. There is no expiry timer/alarm: the 15-second check runs only if a later matching READY arrives. A validated link can navigate outside the narrow content-script matches, so READY may never arrive; the masked pre-snapshot remains in session storage indefinitely and the shortcut stays busy until the user triggers stale recovery. That recovery does not remove the pending job.
**Fix:** Hand off only an execution-committed navigation job. Enforce its deadline independently of READY, clean jobs on tab closure and stale/new-turn recovery, and reset the owning turn at expiry. Handle unsupported navigation with an explicit uncertainty/fallback announcement via TTS; ordinary delivery failures and none proposals should fail locally and release the turn. Test closed tabs, off-origin links, no-job failures and a job that receives no READY.

### CR-09: An epoch-bound element can change meaning without invalidating the proposal

**Classification:** BLOCKER
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/content/snapshot.ts:167-175`
**Related:** `extension/src/content/executor.ts:10-28`, `extension/src/background/pipeline.ts:96-110`
**Issue:** Epoch changes only when takeSnapshot runs. resolveTarget keeps the old WeakRef but overwrites its name/role with the live values, and validation merely checks that the new role is allowed and the new name is not in the danger regex. If a SPA reuses a parcel field as an ordinary search field or a link's destination changes while the model request is in flight, the old proposal still executes against the repurposed control. A rename during the 300 ms delay can also make the spoken pre-line name differ from the actual target. Numeric epoch and tabId do not bind the command to a document/page meaning.
**Fix:** Preserve and compare the snapshot target's semantic identity: document ID/page generation, role, name/hint, input type, link destination and relevant form association. Reject drift rather than silently reinterpret the ID. Bind runtime requests and effect delivery to the owning document or an explicitly committed navigation handoff. Test same-element rename/href/input-purpose changes during model latency and the announcement delay.

### CR-10: Structural containers suppress visible actionable descendants

**Classification:** BLOCKER
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/content/snapshot.ts:111-112`
**Related:** `extension/src/content/snapshot.ts:22-23,132-146`
**Issue:** The walker prunes a whole subtree whenever the container itself has no box. A display:contents wrapper, a zero-size positioned parent with visible children, or an unstyled zero-box shadow host therefore hides rendered child controls from the agent. Separately, headings and role=status/alert/log or aria-live containers return immediately after creating a text node, suppressing any input/button descendants (for example, a live-updating form). The actual walker on a zero-box parent adapter returned no nodes despite its visible child button. A live container containing a textarea produced only an alert and no target ID. The model cannot select these controls, so otherwise supported clicks/fills fail.
**Fix:** Separate subtree exclusion (hidden/inert/aria-hidden/display:none etc.) from whether the current element produces a node. Traverse children of transparent/zero-box structural containers. When aggregating headings/live regions, avoid duplicate prose but continue discovering child controls using the normal masking path. Add real DOM cases for display:contents, positioned children, shadow hosts and aria-live forms.

## Warnings

### WR-01: Repeated utterances can reuse old listening/processing evidence

**Classification:** WARNING
**File:** `/home/bartos/HackYeah2026-challenge/extension/e2e/smoke.mjs:52-68`
**Issue:** speak waits for log.includes('Słucham.') and log.includes('Przetwarzam.') across the page's entire history. On a second utterance these predicates are already true; it does not prove either event occurred for the new recording or that capture was ready before the fixed 800 ms delay/stop. Several scenarios reuse pages and repeated refusal messages, so waits can be satisfied by an earlier turn. Downstream assertions catch some failures, but the harness can miss a missing announcement and can stop a slow new microphone opening prematurely.
**Fix:** Mark the live-log offset or per-message counts before each toggle, and await newly added listening/processing entries belonging to that turn. Mark each later expected reply similarly. Test a delayed second MIC_OPEN and intentionally missing second state announcements.

### WR-02: Timed-out scenarios continue mutating the next scenario's browser

**Classification:** WARNING
**File:** `/home/bartos/HackYeah2026-challenge/extension/e2e/smoke.mjs:74-80`
**Related:** `extension/e2e/smoke.mjs:36-44`
**Issue:** Promise.race rejects on timeout without cancelling scenario.run. The catch immediately continues the scenario loop, and the browser is reused for equal build signatures. The timed-out scenario's waits, toggles, fetch overrides and finally blocks remain live, so they can operate on the next scenario's active tab or undo its spies. This makes subsequent pass/fail evidence unreliable exactly when the suite detects a slow/stuck workflow.
**Fix:** Abort and await scenario cleanup before advancing, or fail the run and close the browser immediately on timeout. If continuing after failures is desired, discard the failed browser/profile and isolate upstream records before the next scenario. Verify that a deliberately timed-out scenario cannot issue another toggle or restore a fetch/TTS hook after the following scenario starts.

---

_Reviewed: 2026-10-03T14:50:37Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
