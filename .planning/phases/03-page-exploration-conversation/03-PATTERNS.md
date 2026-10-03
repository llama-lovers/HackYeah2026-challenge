# Phase 3: Page Exploration & Conversation — Pattern Map

**Mapped:** 2026-10-03
**Scope:** Research-proposed seams; no CONTEXT supplied by explicit authorization. New names remain proposals. Five primary pattern groups below; supporting existing contracts are included only where needed. No implementation or tests changed.

## File Classification

Paths in the first column are relative to the repository root. Existing files should be extended in place. Optional files are not mandatory architecture.

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `extension/src/background/pipeline.ts` | controller | event-driven | Same file, lines 53–69, 95–117, 125–166 | exact |
| `extension/src/background/index.ts` | controller | event-driven | Same file, lines 3–14 | exact |
| `extension/src/shared/conversation.ts` (new) | utility | transform | `extension/src/shared/validate.ts`, lines 14–33 | role-match |
| `extension/src/background/conversation.ts` (optional new) | service | event-driven | `extension/src/background/pipeline.ts`, lines 13–17, 121–124 | exact |
| `extension/src/shared/protocol.ts` | model | request-response | Same file, lines 7–26 | exact |
| `extension/src/content/index.ts` | controller | request-response | Same file, lines 20–34 | exact |
| `extension/src/content/snapshot.ts` | service | transform | `extension/src/shared/validate.ts`, lines 18–32 (candidate policy only) | partial |
| `extension/src/content/executor.ts` | service | event-driven | Same file, lines 9–39 | exact |
| `extension/src/content/scroll.ts` (optional new) | service | event-driven | `extension/src/content/executor.ts`, lines 17–39 | role-match |
| `extension/src/shared/messages.pl.ts` | utility | transform | `extension/src/shared/validate.ts`, lines 3–4 (typed failure vocabulary only) | partial |
| `extension/src/background/proxy.ts` | service | request-response | Same file, lines 8–19 | exact |
| `extension/src/offscreen/offscreen.ts` | service | event-driven | `extension/src/shared/protocol.ts`, lines 12–26 (event contract only) | partial |
| `extension/static/manifest.json` | config | event-driven | None: temporary injection is new | none |
| `extension/src/options/options.ts` / `extension/static/options.html` (wording if needed) | component | event-driven | None needed for copy-only change; central wording is already a proposed seam | none |
| `server/app/schemas.py` | model | request-response | Same file, lines 21–38, 63–81 | exact |
| `server/app/prompts.py` | utility | transform | Same file, lines 26–37, 48–53 | exact |
| `server/app/main.py` | route | request-response | Same file, lines 80–92 | exact |
| `server/app/config.py` | config | transform | None selected; extend existing settings in place | none |
| Existing/new native tests and browser scenarios (filenames finalized by planner) | test | event-driven | Research identifies existing worker and browser harnesses; not re-mapped here | none |
| Existing fake upstream and new exploration/scroll fixtures (filenames finalized by planner) | test | request-response | Research identifies fake schema dispatch; not re-mapped here | none |

There are 20 classification rows, including one two-file wording row and two deliberately unresolved test/fixture families. This is not a claim of 20 final files. Coverage: 11 exact, 2 role-match, 3 partial, 4 without a selected analog.

## Pattern Assignments

### 1. Worker orchestration, conversation storage and dispatch

**Apply to:** background pipeline/index, optional background conversation adapter, offscreen lifecycle integration.

**Analog:** `extension/src/background/pipeline.ts`.

Imports use explicit `.ts` paths and separate type imports (lines 6–11):

```typescript
import { onToggle, isStale } from '../shared/turn.ts';
import type { TurnState } from '../shared/turn.ts';
import { maskText } from '../shared/mask.ts';
import { toModelText, spokenName } from '../shared/snapshot-format.ts';
import * as msg from '../shared/messages.pl.ts';
import { postJson, EgressBlockedError } from './proxy.ts';
```

Copy serialized state transitions, keeping long network work outside the queue (lines 55–60):

```typescript
let serial: Promise<unknown> = Promise.resolve();
export function runSerial<T>(task: () => Promise<T>): Promise<T> {
  const run = serial.then(task, task);
  serial = run.catch(() => {});
  return run;
}
```

The session-storage adapter shape is already present (lines 13–17):

```typescript
export async function getTurn(): Promise<TurnState> {
  return (await chrome.storage.session.get(SESSION_KEYS.turn))[SESSION_KEYS.turn] as TurnState | undefined ?? { phase: 'idle', startedAt: Date.now() };
}
export async function setTurn(turn: TurnState): Promise<void> { await chrome.storage.session.set({ [SESSION_KEYS.turn]: turn }); }
export async function resetTurn(): Promise<void> { await setTurn({ phase: 'idle', startedAt: Date.now() }); }
```

Adapt this shape with runtime validation for stored conversation values. Use session storage for bounded replay/deadline state and local storage only for verbosity. Preserve turn ownership and terminal cleanup at lines 101–117; route local commands before the snapshot at lines 130–135. Do not copy the current global-only cancellation map as durable state or use the action endpoint for exploration. Add deadline recovery and explicit substantive/status/replay output intent.

`extension/src/background/index.ts:9–11` supplies the async receiver shape and top-frame sender checks. Strengthen the offscreen branch at line 7 with offscreen identity verification; extension ID plus payload alone is insufficient.

### 2. Pure conversation rules and candidate policy

**Apply to:** new shared conversation parser/render policy, candidate projection in snapshot, recovery message mapping.

**Analog:** `extension/src/shared/validate.ts:14–23`.

```typescript
export function validateProposal(p: Proposal, t: ResolvedTarget | null): Verdict {
  const reject = (reason: RejectReason): Verdict => ({ ok: false, reason });
  if (!['click', 'fill', 'none'].includes(p.action)) return reject('unknown_action');
  if (p.action === 'none') return { ok: true, kind: 'none' };
  if (t === null || !t.exists) return reject('not_found');
  if (!t.epochMatches) return reject('stale');
  if (!t.connected) return reject('not_found');
  if (!t.visible) return reject('hidden');
  if (t.disabled) return reject('disabled');
  if (!(p.action === 'click' ? CLICK_ROLES : FILL_ROLES).has(t.role)) return reject('role_mismatch');
```

Copy pure functions, finite discriminated results and early refusal returns. The parser itself is new: normalize then match complete phrases, with an explicit unknown result preserving the existing action route. Do not copy safety regexes as conversation grammar.

Candidate eligibility must share the target checks and irreversible-action policy at lines 24–32. Extract reusable target eligibility rather than fabricate fill text to satisfy `validateProposal`. Suggestions are a unique subset of locally eligible IDs, rechecked for document/epoch and policy freshness; they never authorize execution. Keep existing action variants unchanged.

### 3. Content messages, announcement ACK and scroll

**Apply to:** content index/executor/optional scroll and shared protocol.

**Analog:** `extension/src/content/index.ts:20–26`:

```typescript
case 'EXECUTE':
  // A proposal made against another document instance (reload, SPA hard navigation) must not act here.
  if (message.docId !== getDocumentId()) { respond({ ok: false, reason: 'stale' }); break; }
  void execute(message.epoch, message.proposal, announcer, async () => {
    try { return ((await chrome.runtime.sendMessage({ type: 'EXECUTING', turnId: message.turnId, jobId: message.jobId })) as { ok?: boolean } | undefined)?.ok === true; } catch { return false; }
  }).then(respond).catch(() => respond({ ok: false, reason: 'not_found' }));
  return true;
```

Copy async channel retention and document binding, then add runtime payload validation. For ANNOUNCE, replace the current immediate ACK at line 15 with an ACK after the existing announcer promise resolves. Preserve the initialization guard at lines 7–9 for repeated injection.

`extension/src/content/executor.ts:17–24` shows pre-announcement followed by revalidation:

```typescript
await announcer.announce(verdict.kind === 'click' ? clickPre(name) : fillPre(name));
await new Promise(resolve => setTimeout(resolve, 300));
// Revalidate all live policy signals across the announcement delay.
resolved = resolveTarget(proposal.target, epoch);
const liveVerdict = validateProposal(proposal, resolved.target);
if (!liveVerdict.ok) return liveVerdict;
const pre = getLastSnapshot();
if (!pre || pre.epoch !== epoch) return { ok: false, reason: 'stale' };
```

Scroll should copy ordering/ownership, not fill focus changes or action jobs. Measure before/after document scroll; unchanged position is a boundary/limitation, not success. A dedicated scroll union follows `extension/src/shared/protocol.ts:8–10` result unions. Its runtime decoder can follow `isFromOffscreen` at lines 16–26.

### 4. Read-only proxy contract and error handling

**Apply to:** main route, schemas, proxy transport, config token budget.

**Analog:** `server/app/main.py:80–92`:

```python
@app.post("/api/effect")
async def effect(body: EffectRequest):
    if not settings.openrouter_api_key:
        return JSONResponse({"error": "no_api_key"}, status_code=503)
    try:
        data = await chat_json(app.state.http, settings, schema_name="effect_summary",
                               schema=EFFECT_SCHEMA, messages=build_effect_messages(body.action, body.diff),
                               max_tokens=settings.effect_max_tokens)
        return EffectSummary.model_validate(data).model_dump()
    except ValidationError:
        return JSONResponse({"error": "model_invalid_output"}, status_code=502)
    except UpstreamError as exc:
        return JSONResponse({"error": exc.code}, status_code=502)
```

Use existing `app.*` imports (main lines 16–21), shared HTTP client, one provider completion and explicit local output validation. The new route inherits existing middleware at lines 48–60; do not duplicate an unguarded app. It returns descriptions/candidate IDs only.

`server/app/schemas.py:21–22,63–72` provides strict extra-field rejection and bounded nested arrays:

```python
class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")

ShortText = Annotated[str, Field(max_length=200)]

class PageDiffModel(StrictModel):
    path: Transition | None = None
    title: Transition | None = None
    added: list[ShortText] = Field(default_factory=list, max_length=8)
    removed: list[ShortText] = Field(default_factory=list, max_length=5)
    changed: list[DiffChange] = Field(default_factory=list, max_length=8)
    alerts: list[ShortText] = Field(default_factory=list, max_length=3)
```

Give exploration its own sentence/ID bounds and mode validation. Do not copy `Speech`'s slicing validator: exploration needs whole sentences and invalid-output rejection. Mirror provider, Pydantic and TS contracts; generic `postJson<T>` does not validate runtime JSON.

### 5. Prompt construction and masked egress

**Apply to:** prompts and proxy integration.

**Analog:** `server/app/prompts.py:26–29,48–53`:

```python
def fence(value: str, *tags: str) -> str:
    for tag in tags:
        value = value.replace(f"</{tag}>", f"<\\/{tag}>")
    return value

def build_effect_messages(action, diff) -> list[dict]:
    tags = ("executed_action", "page_diff")
    action_json = fence(action.model_dump_json(exclude_none=True), *tags)
    diff_json = fence(diff.model_dump_json(exclude_none=True), *tags)
    return [{"role": "system", "content": EFFECT_SYSTEM_PROMPT},
            {"role": "user", "content": f"<executed_action>\n{action_json}\n</executed_action>\n<page_diff>\n{diff_json}\n</page_diff>"}]
```

Reuse fencing and system/user separation for masked snapshots/candidate evidence. The exploration prompt is new and must explicitly treat page text as untrusted. It cannot return actions to execute.

## Shared Patterns

- **Authorization:** top-frame/tab checks in background index lines 8–11, document checks in content index line 22 and current-turn checks in pipeline lines 101–102,124. No new login system. New receivers need runtime decoders as well as TS types.
- **Privacy:** `extension/src/background/proxy.ts:8–9` already refuses unmasked egress: `if (maskText(serialized) !== serialized) throw new EgressBlockedError('unsafe_egress');`. Retain this for exploration. Replay contains page-derived data and stays session-only.
- **Cancellation/errors:** proxy lines 14–17 combines caller cancellation with timeout and throws `ProxyError(status, code)`. Preserve distinctions when producing Polish recovery messages; do not speak raw provider messages. Every terminal path clears pending wait work.
- **Safe output:** `extension/src/content/live-region.ts:18–23` clears both nodes, waits, assigns `nodes[next]!.textContent = item.text`, resolves `item.written()`, then alternates nodes. Reuse it unchanged where possible; acknowledgment proves a DOM write, not audible delivery.
- **Verification:** research already identifies the worker mock, fake upstream and CDP scenarios. Extend those seams for local/session separation, fake-clock deadline ownership, malformed exploration output and measured scrolling. Real command permission grants and repeated screen-reader speech still require human/browser acceptance. No test rerun was needed for this documentation-only mapping.

## No Analog Found

| Capability/file | Reason / planner guidance |
|---|---|
| Temporary injection in manifest/worker | No current activeTab injection implementation; use research's command-gesture, ping/inject/ping proposal. |
| Exact conversation grammar | Pure-validator style exists, but no complete-phrase conversational parser. |
| Persistent verbosity and replay lifecycle | Session turn adapter exists; three-level local preference and page-scoped replay semantics are new. |
| Measured document scroll | Executor supplies ordering, not scroll outcome semantics; do not copy its focus movement. |
| Settings/onboarding wording and test/fixture filenames | Finalize in plan; retain existing structure and research's harness references rather than create new infrastructure. |

## Metadata

**Analog search scope:** tracked `extension/src`, `extension/static`, `server/app`; research test seams retained without exhaustive re-research. Eleven source files were read for extraction; all source analog paths above were checked with `git ls-files` and returned tracked paths. No install/runtime mirrors or teammate `live_tts/` files used. Project AGENTS/local skill probes found none; root CLAUDE instructions and scoped GSD workflow mandate were consulted. Dedicated Read/Write tools were unavailable; command reads and the native patch writer were used. Only this artifact was written.
