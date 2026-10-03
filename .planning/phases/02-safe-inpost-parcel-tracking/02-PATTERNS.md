# Phase 2: Safe InPost Parcel Tracking - Pattern Map

**Mapped:** 2026-10-03
**Files analyzed:** 24 (10 new, 14 modified)
**Analogs found:** 24 / 24 (all git-tracked; no gitignored mirrors involved)

Conventions seen everywhere in Phase 1: ES imports with explicit `.ts` extensions; `import * as msg from '../shared/messages.pl.ts'`; pure logic in `extension/src/shared/` with a sibling `*.test.ts` using `node:test` + `node:assert/strict`; code and identifiers in English, user text in Polish; dense single-line style; state in `chrome.storage.session`, written only inside `runSerial`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `extension/src/shared/polish-speech.ts` (new) | utility | transform | `extension/src/shared/mask.ts`, `wav.ts` | role-match |
| `extension/src/shared/polish-speech.test.ts` (new) | test | transform | `extension/src/shared/mask.test.ts`, `turn.test.ts` | exact |
| `extension/src/shared/intent.ts` (new) | utility | transform | `extension/src/shared/turn.ts` (pure fn) + `mask.ts` regex style | role-match |
| `extension/src/shared/pending.ts` (new) | model/utility | event-driven (state) | `extension/src/shared/turn.ts` + `PendingEffectJob` in `protocol.ts:34` | exact |
| `extension/src/shared/limits.ts` (new) | config | n/a | constants in `protocol.ts:3-6` | role-match |
| `extension/src/shared/validate.ts` (mod) | utility/policy | request-response | itself (`validate.ts:14-33`) | exact |
| `extension/src/shared/protocol.ts` (mod) | model/types | request-response | itself | exact |
| `extension/src/shared/messages.pl.ts` (mod) | utility | transform | itself (`REJECTIONS`, builders) | exact |
| `extension/src/shared/mask.ts` (mod, extend `SENSITIVE_FIELD_RE`) | utility | transform | itself | exact |
| `extension/src/background/pipeline.ts` (mod: routing, `performProposal`, skill) | service | request-response | itself (`runCommand` 125-166) | exact |
| `extension/src/background/pipeline.test.ts` (mod) | test | request-response | itself | exact |
| `extension/src/content/executor.ts` (mod: `confirmed`) | controller | request-response | itself (9-50) | exact |
| `extension/src/content/snapshot.ts` (mod: `consent` signal) | service | transform | itself (`resolveTarget`) | exact |
| `extension/src/content/index.ts` (mod: `READ_STATUS`, probe) | controller | request-response | itself (11-36 switch) | exact |
| `extension/src/content/tracking.ts` (new) | service | request-response (DOM read) | `extension/src/content/settle.ts` + `snapshot.ts` | role-match |
| `server/app/schemas.py` (mod: `choose`) | model | request-response | itself | exact |
| `server/app/prompts.py` (mod) | config | request-response | itself | exact |
| `server/tests/fake_openrouter.py` (mod) | test | request-response | itself | exact |
| `server/tests/test_action.py` (mod) | test | request-response | itself | exact |
| `server/fixtures/tracking-form.html` (mod), `consent-banner.html`, `ambiguous.html`, `captcha.html` (new) | fixture | n/a | `server/fixtures/sensitive.html`, `tracking-form.html` | exact |
| `extension/e2e/scenarios/{confirm,tracking,secrets,choice}.mjs` (new) | test (e2e) | request-response | `extension/e2e/scenarios/refusals.mjs` | exact |
| `extension/e2e/scenarios/refusals.mjs`, `effect.mjs`, `tracer.mjs`, `extension/e2e/dom-check.mjs` (mod) | test (e2e) | request-response | themselves | exact |
| `extension/src/shared/{validate,messages.pl}.test.ts` (mod) | test | n/a | themselves | exact |

## Pattern Assignments

### `extension/src/shared/validate.ts` (policy, request-response)

**Analog:** itself, `validate.ts:14-33`. Add third param `opts: { confirmed?: boolean } = {}`, add `consent: boolean` to `ResolvedTarget` (line 2). Keep every hard check; only the two confirm-class lines get gated; drift stays last.

```typescript
// validate.ts:29-33 (current)
if (p.needs_confirmation) return reject('needs_confirmation');
if (p.action === 'click' && (IRREVERSIBLE_NAME_RE.test(t.name) || SIDE_EFFECT_RE.test(t.name) || t.submitsNonLookupForm || t.sideEffectSignals || !t.knownSafe)) return reject('irreversible');
// Checked last so a repurposed control is still refused for its own, more specific reason first.
if (t.drifted) return reject('stale');
```
Change to `!opts.confirmed && ...` on lines 29-30 and add `|| t.consent` to line 30. Also add `confirmed` to `Proposal` consumers only via `opts`, never via the proposal (model cannot set it).

**Test pattern** (`validate.test.ts:1-30`): table-driven `cases: [RejectReason, Partial<Proposal>, Partial<ResolvedTarget>|null][]` plus `for (const name of [...]) test(...)`. The `target` fixture literal must gain `consent: false`. Add cases: confirmed=true lets `irreversible`/`needs_confirmation` through but still rejects `sensitive_fill`, `hidden`, drift (`stale`).

---

### `extension/src/content/executor.ts` (controller, request-response)

**Analog:** itself. Signature `execute(epoch, proposal, announcer, commit)` at line 9. Add an `opts: { confirmed?: boolean }` and pass it to all four `validateProposal(...)` calls (lines 11, 21, 31, 37). On a confirm-class reject return it enriched so the SW can speak and store it:

```typescript
// executor.ts:11-12 (current)
const verdict = validateProposal(proposal, resolved.target);
if (!verdict.ok) return verdict;
```
Keep the 300 ms pre-line (lines 17-18) and the revalidations untouched (research constraint). `ExecuteResult` reject variant in `protocol.ts:9` gains optional `name`, `role`, `category`.

---

### `extension/src/content/index.ts` (controller, request-response)

**Analog:** itself, message switch lines 11-36. Copy the sender check and async-respond shape:

```typescript
chrome.runtime.onMessage.addListener((message: ToContent, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  switch (message.type) {
    case 'SETTLE_DIFF':
      void (async () => {
        try { await startSettleWatch({ ignore: el => announcer.host.contains(el) }); respond({ ok: true, diff: ... }); }
        catch { respond({ ok: false, error: 'snapshot_failed' }); }
      })();
      return true;
```
New `READ_STATUS` case: same `void (async () => {...})(); return true;` shape, polling `readParcelStatus(document, message.number)` until result or the settle cap, reusing `startSettleWatch`. `EXECUTE` case (lines 20-26): keep the `docId` guard (`if (message.docId !== getDocumentId()) respond({ok:false, reason:'stale'})`), forward `confirmed: message.confirmed` into `execute`.

---

### `extension/src/content/tracking.ts` (new; service, DOM read)

**Analog:** `extension/src/content/settle.ts` (module that takes `document`-level inputs, exports small pure-ish functions, uses `checkVisibility`) and the code in RESEARCH "Status extractor". Copy the RESEARCH `readParcelStatus` verbatim (uses `textContent`, no `safe()`/`maskText`, no truncation). `detectCaptcha(doc)` is a single `doc.querySelector('iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="challenges.cloudflare.com"], .g-recaptcha, .h-captcha, .cf-turnstile, [data-sitekey]') !== null`. Polling for the wrapper should reuse `BUSY_SELECTOR` (`settle.ts:2`).

---

### `extension/src/content/snapshot.ts` (`resolveTarget`, lines ~272-281)

**Analog:** itself. Add a `consent` boolean to the returned `ResolvedTarget`: `!!el.closest('#didomi-host, [id^="didomi-"], [class*="didomi-"]')` OR a `[role=dialog]` ancestor whose text matches `/cookie|zgod|prywatno/i`. Follow how `isLookupForm` / `submitsNonLookupForm` is computed there (same function, same style of ancestor test). Must not call `safe()` on anything new.

---

### `extension/src/shared/protocol.ts` (types)

**Analog:** itself. Concrete edits (lines 5, 7, 9):
- `SESSION_KEYS = { turn: 'turn', pendingEffect: 'pendingEffect', pending: 'pending' } as const`
- `EXECUTE` variant gets `confirmed?: boolean`; add `| { type: 'READ_STATUS'; number: string }`
- reject variant: `{ ok: false; reason: RejectReason; name?: string; role?: string; category?: 'consent' | 'irreversible' | 'model_flag' }`
- Put `PendingInteraction` next to `PendingEffectJob` (line 34), or in `pending.ts` re-exported; the research shape is the discriminated union to use.

---

### `extension/src/shared/pending.ts`, `intent.ts`, `limits.ts` (new, pure)

**Analog:** `extension/src/shared/turn.ts` (entire file): exported types, small constant (`STALE_MS = 30000`), and a pure function taking `now` and optional injected id so tests are deterministic.

```typescript
export const STALE_MS = 30000;
export function isStale(s: TurnState, now: number): boolean { return s.phase !== 'idle' && now - s.startedAt > STALE_MS; }
export function onToggle(state, tabId, now, id: string = crypto.randomUUID()): { next: TurnState; effect: 'start' | 'stop' | 'busy' } {
```
Mirror: `routeReply(pending, rawText, now)` returns the string union; `CONFIRM_TTL_MS` in `limits.ts`; `isExpired(p, now)`. Whole-utterance matching only (normalise with the NFD strip shown in RESEARCH, then `^tak$`). **Test analog:** `turn.test.ts` (one `test(...)` per branch, boundary at TTL and TTL+1 as in "stale reset occurs at 30001 ms, never at 30000 ms").

`intent.ts` regex style: copy the Unicode-aware boundary idiom from `validate.ts:8,13`: `/(?<![\p{L}\p{N}])(?:...)(?![\p{L}\p{N}])/iu`. Note the prefix gotcha recorded in RESEARCH (it fails on "Zaakceptuj").

---

### `extension/src/shared/polish-speech.ts` (new, transform) and test

**Analog:** `extension/src/shared/mask.ts` / `mask.test.ts` (pure string transforms with table-driven tests); RESEARCH gives the algorithm (`strip`, chunk tables, declension rule). Table-test pattern from `validate.test.ts` (`for (const [input, expected] of cases) test(...)`). Include the carve-out test: verbatim quote substring equals DOM text.

---

### `extension/src/shared/messages.pl.ts` (mod)

**Analog:** itself. Constants are `export const NAME = 'Polish text.'`, builders are `export function x(name: string): string`. Lines 22, 37-38: `NEEDS_CONFIRMATION` and the `irreversible`/`needs_confirmation` entries of `REJECTIONS` are replaced by the confirmation prompt builders (e.g. `confirmClick(name, consent)`); `REJECTIONS: Record<RejectReason, string>` must stay exhaustive (TypeScript enforces it). `sensitive_fill` text gains the "ask a person" suggestion. Update `messages.pl.test.ts` ("every rejection is spoken...") deliberately (Pitfall 9).

---

### `extension/src/background/pipeline.ts` (service, request-response)

**Analog:** itself. Key excerpts to preserve when extracting `performProposal`:

Session-state access pattern (lines 13-17, 121-124): copy for `getPending/setPending/clearPending`:
```typescript
const JOB = SESSION_KEYS.pendingEffect;
async function getJob(): Promise<PendingEffectJob | undefined> { return (await chrome.storage.session.get(JOB))[JOB] as PendingEffectJob | undefined; }
async function dropJob(id: string): Promise<void> { if ((await getJob())?.id === id) await chrome.storage.session.remove(JOB); }
async function ownsTurn(turnId: string): Promise<boolean> { return !turnSignal(turnId).aborted && (await getTurn()).id === turnId; }
```
Writes must go through `runSerial(() => ...)` (lines 55-60). Extension point in `runCommand` (lines 125-166): insert pending routing and `parseIntent` between `if (!text) {...}` (line 129) and the `SNAPSHOT` send (line 133). Extract lines 143-165 (job creation, `EXECUTE`, handoff catch, reject/none/effect branches) into `performProposal(...)`; keep this exact handoff logic:
```typescript
catch {
  const job = await getJob();
  if (jobId && job?.id === jobId && job.state !== 'proposed') return 'handoff';
  if (jobId) await dropJob(jobId);
  await say(msg.ACTION_FAILED);
  return;
}
```
`handleTabRemoved` (188-194): add `chrome.storage.session.remove(SESSION_KEYS.pending)` when `pending.tabId === tabId`. Confirmed path: send `EXECUTE` with stored `epoch`/`docId`/`proposal`, `confirmed: true`, and do NOT send `SNAPSHOT` first. Always create a `proposed` job (required by `handleExecuting`, line 171). Local effect text replaces `announceEffect` on the confirmed and skill paths (line 43-52 calls `/api/effect`). Model text goes through `maskText` before upstream as at line 139.

**Test analog:** `extension/src/background/pipeline.test.ts` (extend for routing/budget).

---

### `server/app/schemas.py`, `prompts.py`, `tests/fake_openrouter.py`

**Analog:** themselves. Flat strict schema (lines 7-18) and the pydantic mirror (lines 33-38) must change together:
```python
"action": {"type": "string", "enum": ["click", "fill", "none"]},   # add "choose"
...
"required": ["action", "target", "text", "needs_confirmation", "say"],
"additionalProperties": False,
```
```python
class ActionProposal(StrictModel):
    action: Literal["click", "fill", "none"]
    target: str = Field(max_length=32)
```
Add `option_1..option_3: str = Field(max_length=32)` and add them to `required`. In `prompts.py:13-14` replace "return none with one short Polish question naming at most three options" with `choose` semantics; update the two examples at the bottom (the "two buttons named Usuń" example currently returns `none`). Fake: keep `needs_confirmation: False` always (see line 28 payload shape).

---

### `server/fixtures/*.html` and `extension/e2e/scenarios/*.mjs`

**Analog:** `server/fixtures/sensitive.html` (has `window.__paid` set in the submit handler; model for `consent-banner.html` with `window.__consent`) and `tracking-form.html` (result markup to realign to `.parcel-wrapper[data-tracking] > .parcelStatusInfo > .status h2 + .description`).

**Scenario shape** (`refusals.mjs`): copy exactly.
```javascript
import assert from 'node:assert/strict';
export const name = 'refusals';
export async function run(ctx) {
  const sensitive = await ctx.openPage('/fixtures/sensitive.html');
  const mark = await ctx.upstreamMark();
  await ctx.speak(sensitive, 'kliknij Zapłać');
  await ctx.waitForLive(sensitive, 'Tej akcji nie wykonam bez potwierdzenia.');
  await ctx.waitIdle();
  assert(!(await ctx.liveLog(sensitive)).includes('Klikam Zapłać.'));
  assert.notEqual(await sensitive.evaluate('window.__paid'), true);
  assert.equal((await ctx.upstreamSince(mark)).length, 1);
```
Confirm scenario: second `ctx.speak(page, 'tak')`, assert `__paid === true` and `upstreamSince(mark).length` stays 1 (only the planning request before the prompt). Update the `refusals.mjs` expectations for "kliknij Zapłać" (new prompt wording) and the password refusal text. `ctx.liveLog` works for the verbatim "Status na stronie: " assertion.

## Shared Patterns

### Session state discipline
**Source:** `extension/src/background/pipeline.ts:53-60, 121-124`. All `chrome.storage.session` read-modify-write inside `runSerial`; never module globals (SW is killed when idle). Applies to `pending` handling.

### Content-script message guard
**Source:** `extension/src/content/index.ts:11-12`. `if (sender.id !== chrome.runtime.id) return;` and `docId` check before `EXECUTE`. Applies to every new `ToContent` case.

### Fail-closed validation, model never has the last word
**Source:** `extension/src/shared/validate.ts:14-33`. Policy computed from live DOM signals; `confirmed` only from SW (stored pending record). Applies to executor, SW, tests.

### Pure module plus node:test
**Source:** `extension/src/shared/turn.ts` + `turn.test.ts`. Applies to `polish-speech`, `intent`, `pending`, `limits`.

### Privacy: nothing verbatim goes upstream
**Source:** `pipeline.ts:139` (`maskText` on utterance) and `snapshot.ts` `safe()`. The status quote is read raw in `tracking.ts`, spoken locally, never posted to `/api/*` (add e2e assertion).

### Polish messages
**Source:** `extension/src/shared/messages.pl.ts`. All user text lives here, short, announcement first then effect.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Polish words-to-digits parser, declension and date speech (inside `polish-speech.ts`) | utility | transform | No number/language logic exists; use the RESEARCH algorithm and tables |
| `captcha.html` fixture | fixture | n/a | No captcha fixture; build a minimal `.g-recaptcha` stub in the style of `sensitive.html` |
| Numbered-choice reply matcher (`routeReply` choose branch) | utility | event-driven | No multi-turn dialog exists in Phase 1; `turn.ts` is a structural analog only |

## Metadata

**Analog search scope:** `extension/src`, `extension/e2e`, `server/app`, `server/tests`, `server/fixtures` (verified via `git ls-files`)
**Files scanned/read:** about 14
**Pattern extraction date:** 2026-10-03
