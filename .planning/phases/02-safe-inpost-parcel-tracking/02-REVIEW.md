---
phase: 02-safe-inpost-parcel-tracking
reviewed: 2026-10-03T20:06:54Z
depth: standard
files_reviewed: 47
files_reviewed_list:
  - extension/e2e/dom-check.mjs
  - extension/e2e/scenarios/choice.mjs
  - extension/e2e/scenarios/confirm.mjs
  - extension/e2e/scenarios/consent.mjs
  - extension/e2e/scenarios/effect.mjs
  - extension/e2e/scenarios/privacy.mjs
  - extension/e2e/scenarios/refusals.mjs
  - extension/e2e/scenarios/secrets.mjs
  - extension/e2e/scenarios/tracer.mjs
  - extension/e2e/scenarios/tracking.mjs
  - extension/e2e/scenarios/turns.mjs
  - extension/e2e/scenarios/wav.mjs
  - extension/src/background/pipeline.test.ts
  - extension/src/background/pipeline.ts
  - extension/src/content/executor.ts
  - extension/src/content/index.ts
  - extension/src/content/snapshot.ts
  - extension/src/content/tracking.ts
  - extension/src/offscreen/offscreen.ts
  - extension/src/shared/choice.test.ts
  - extension/src/shared/choice.ts
  - extension/src/shared/intent.test.ts
  - extension/src/shared/intent.ts
  - extension/src/shared/limits.test.ts
  - extension/src/shared/limits.ts
  - extension/src/shared/mask.test.ts
  - extension/src/shared/mask.ts
  - extension/src/shared/messages.pl.test.ts
  - extension/src/shared/messages.pl.ts
  - extension/src/shared/parcel.test.ts
  - extension/src/shared/parcel.ts
  - extension/src/shared/pending.test.ts
  - extension/src/shared/pending.ts
  - extension/src/shared/polish-speech.test.ts
  - extension/src/shared/polish-speech.ts
  - extension/src/shared/protocol.ts
  - extension/src/shared/validate.test.ts
  - extension/src/shared/validate.ts
  - server/app/prompts.py
  - server/app/schemas.py
  - server/fixtures/ambiguous.html
  - server/fixtures/consent-banner.html
  - server/fixtures/sensitive.html
  - server/fixtures/tracking-form.html
  - server/tests/fake_openrouter.py
  - server/tests/test_action.py
  - server/tests/test_seams.py
findings:
  critical: 4
  warning: 1
  info: 0
  total: 5
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-10-03T20:06:54Z
**Depth:** standard
**Files Reviewed:** 47
**Status:** issues_found

## Summary

Reviewed the Phase 02 extension and server source scope from `5bf0e4d5b9792b9cbea99dff1bc1e3f362c30108..HEAD`, including changed tests and fixtures, with relevant caller and safety-policy context. Four blockers affect secret egress, the meaning of stored confirmations, consent enforcement across shadow roots, and the accuracy of spoken parcel results. One warning affects parcel dialog expiry. These findings were reproduced against the actual modules; passing baseline suites do not cover the demonstrated triggers.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: Common secret requests bypass the pre-egress refusal

**Severity:** BLOCKER (Critical)
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/shared/intent.ts:5-12`
**Related:** `/home/bartos/HackYeah2026-challenge/extension/src/background/pipeline.ts:213-215`, `:253-254`; `/home/bartos/HackYeah2026-challenge/extension/src/shared/mask.ts:25-46`
**Issue:** The refusal requires a narrowly enumerated verb or a secret noun followed by `to`/`jest`. Explicit requests such as `ustaw hasło Tajne123`, `zmień PIN na 1234`, and `wpisz kod z wiadomości SMS 731904`, plus the dictated assignment `hasło: Tajne123`, all classify as `other`. The fallback masker recognizes checksum-valid identifiers but does not redact passwords or short PIN/SMS codes. The pipeline consequently sends the complete secret to `/api/action` before the sensitive-field executor or model instructions can refuse it. This violates SAFE-03 even when the model subsequently returns `none` and no field is filled.
**Verified trigger and impact:** With the actual `runCommand`, `parseIntent`, and `postJson` modules and a Chrome/fetch adapter, each of the four quoted utterances produced a `/api/action` body whose `utterance` exactly equalled the original secret-bearing text. No real secret or external provider was used.
**Fix:** Expand local request and assignment recognition to these ordinary Polish forms, including setting/changing a secret, colon assignments, and intervening words in SMS/code descriptions. Add a conservative pre-egress secret-content guard so a recognized secret label with supplied content cannot escape merely because its verb or wording is absent from the intent allowlist; ordinary questions about where a field is should remain allowed. Cover the demonstrated utterances with pipeline assertions for zero SNAPSHOT/EXECUTE/fetch calls, no echoed secret, and preserved pending state. Refusal by the remote model is too late to protect confidentiality.

### CR-02: Confirmation remains valid after the selected parcel changes meaning

**Severity:** BLOCKER (Critical)
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/background/pipeline.ts:225-226`
**Related:** `/home/bartos/HackYeah2026-challenge/extension/src/shared/choice.ts:19-27`; `/home/bartos/HackYeah2026-challenge/extension/src/content/snapshot.ts:275-282`; `/home/bartos/HackYeah2026-challenge/extension/src/shared/validate.ts:33-35`
**Issue:** A numbered deletion is presented and confirmed using its heading context, but that context is not bound to the execution authorization. `confirm_action.context` is stored only for speech and is omitted by the confirmed branch. The semantic identity compares the control's own name/role and form metadata, excluding the heading and the record binding that the page's handler uses. A reused `Usuń` element can therefore switch from the parcel the user approved to another parcel while retaining its ID, epoch, document and label. `confirmed: true` then bypasses the irreversible-action rejection and the final checks accept the changed action.
**Verified trigger and impact:** In real headless Chromium, an actual snapshot of `Usuń` under `Paczka z Poznania` was taken. Before confirmation, the same button's record binding (`data-city`, read by its click handler) and heading were changed to Warszawa. `resolveTarget(...).target.drifted` remained `false`; the actual executor returned `{ok:true, kind:'click'}` with confirmation enabled, and its handler deleted Warszawa. The fixture's deletion handlers use precisely this dataset-at-click pattern. This is a wrong-record deletion risk, not a merely renamed control: the existing rename regression does not cover it.
**Fix:** Bind contextual choices and confirmations to a content-derived identity of the owning record/context, alongside the existing control identity. Preserve that expected identity through choose -> confirm -> EXECUTE and compare it against the live DOM during every executor revalidation, including immediately before the click. At minimum, a change to the heading that was spoken for the selected option must invalidate authorization; include relevant record-binding attributes or a stable owning-record identity so recycled list controls cannot retarget silently. Add a browser regression that changes the chosen row's heading/binding while preserving the button node and label and requires a stale refusal with no deletion.

### CR-03: Consent controls in a shadow root bypass consent confirmation

**Severity:** BLOCKER (Critical)
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/content/snapshot.ts:261-269`
**Related:** `/home/bartos/HackYeah2026-challenge/extension/src/content/snapshot.ts:46-48`, `:195-197`; `/home/bartos/HackYeah2026-challenge/extension/src/shared/validate.ts:33`
**Issue:** The snapshot deliberately discovers controls in open shadow roots, but `consentSignal` uses `Element.closest` and `parentOf`, which stop at a shadow boundary. A control in the shadow tree of a recognized CMP container such as `#didomi-host` is consequently classified as `consent:false`. Harmless-label controls such as `Zamknij` then receive an ordinary safe-click verdict and execute without the informed consent prompt or `tak`, violating the rule that every control in a consent container requires confirmation. The same gap applies when a cookie-labelled dialog surrounds the shadow host.
**Verified trigger and impact:** In real Chromium, `#didomi-host` with an open shadow root containing `<button type="button">Zamknij</button>` was included in the actual snapshot. Resolving the button returned `consent:false`, and the actual `validateProposal` returned `{ok:true, kind:'click'}` without confirmation. Light-DOM CMP tests all pass because they never cross this boundary.
**Fix:** Walk the composed ancestor chain with the existing shadow-aware `parentElement` helper. At each ancestor, check known CMP selectors and cookie-labelled dialog containers instead of relying on a single `closest` within one root. Maintain the existing fail-closed exception policy. Add browser cases for a shadow button beneath both a recognized CMP host and an outer generic cookie dialog; each must require confirmation while an unrelated shadow lookup remains permitted.

### CR-04: Parcel speech prefers hidden stale results over the visible result

**Severity:** BLOCKER (Critical)
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/content/tracking.ts:12-19`
**Related:** `/home/bartos/HackYeah2026-challenge/extension/src/content/tracking.ts:24-29`
**Issue:** The status reader takes the first matching `.parcel-wrapper` and reads unrestricted `textContent`, without checking whether that wrapper or its status/error content is visible. If a hidden cached/template result precedes the visible result for the same tracking number, it immediately reports the hidden old status and never reaches the current one. A hidden status or typing-error container can also suppress the missing-result/captcha explanation. For a blind user this asserts a delivery state that the page is not currently presenting.
**Verified trigger and impact:** In real Chromium, a hidden matching wrapper containing `Stary ukryty status` was placed before a visible matching wrapper containing `Aktualny widoczny status`. The actual `readParcelStatus(document, '12345678')` returned `{kind:'status', title:'Stary ukryty status', description:''}`. The polling loop returns that result immediately, so waiting longer does not repair it.
**Fix:** Restrict matching wrappers and status/error nodes to rendered, accessible page content using the content script's visibility rules (including hidden/inert/aria-hidden ancestors). Search all eligible matching wrappers rather than stopping at the first hidden match, and apply the same rule to `#typingErrorMsgContainer`. Preserve the intended raw, unmasked local quotation of the selected visible result. Add regressions with a hidden old matching wrapper before a visible current wrapper and with hidden stale errors plus a visible captcha; speech must follow the visible result or captcha.

## Warnings

### WR-01: An expired parcel-number reply falls through to model planning

**Severity:** WARNING
**File:** `/home/bartos/HackYeah2026-challenge/extension/src/background/pipeline.ts:231-233`
**Related:** `/home/bartos/HackYeah2026-challenge/extension/src/shared/pending.ts:13-14`; `/home/bartos/HackYeah2026-challenge/extension/src/background/pipeline.ts:245-254`
**Issue:** After asking `Podaj numer przesyłki`, a user who takes more than sixty seconds to answer with the number receives no expiry explanation. `routeReply` returns `expired`, but the pipeline stops only for choices or yes/no; a numeric parcel reply becomes a fresh model command and sends the number and snapshot to `/api/action`. The original plan explicitly allowed non-yes/no expired utterances to become new commands, so this is a robustness/privacy flaw in that fallback design rather than a failure to implement the plan. An answer to the agent's local parcel question should not unexpectedly acquire network planning merely because dictation was late.
**Verified trigger and impact:** An actual `await_parcel_number` record aged 61 seconds followed by `873234987612340872938732` caused one SNAPSHOT and a `/api/action` request containing those exact digits, followed by the model's generic none response instead of `CONFIRM_EXPIRED`. The already-fixed expired-choice regression does not cover parcel replies.
**Fix:** For an expired parcel dialog, recognize number-only replies locally and stop with `CONFIRM_EXPIRED` (or begin a fresh local readback if that product behavior is chosen). Keep explicit fresh commands routable without treating a number-only answer as a new model command. Add pipeline cases for both digit and spoken-digit replies just beyond the TTL with zero SNAPSHOT/EXECUTE/fetch calls and a clear expiry message.

---

_Verification: Direct Node reproductions used the actual pipeline/intent/proxy modules with Chrome and fetch adapters. DOM reproductions used the actual snapshot, validator, executor and tracking modules bundled in memory into temporary headless Chromium on localhost. No source files were modified; no real credentials or upstream model requests were used. The existing full suites were read for coverage and were not rerun as a substitute for these adversarial cases._

_Reviewed: 2026-10-03T20:06:54Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
