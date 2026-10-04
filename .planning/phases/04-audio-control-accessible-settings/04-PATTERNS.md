# Phase 04: Audio Control & Accessible Settings - Pattern Map

**Mapped:** 2026-10-04
**Files classified:** 19 (proposed module/test names remain planner choices)
**Coverage:** 16 exact/role matches; 3 partial matches requiring new behavior

CONTEXT.md is absent by authorization. Scope comes from 04-RESEARCH.md; its assumptions and open questions remain proposals. All existing source paths below were checked with `git ls-files`. No source changes are part of this map.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `extension/static/manifest.json` | config | event-driven | existing file | exact |
| `extension/src/background/index.ts` | controller | event-driven | existing file | exact |
| `extension/src/background/pipeline.ts` | service | event-driven | existing file | exact |
| `extension/src/shared/protocol.ts` | model | request-response | existing file | exact |
| `extension/src/shared/conversation.ts` | utility | transform | existing file | exact |
| `extension/src/shared/settings.ts` (proposed) | utility | transform | `extension/src/shared/conversation.ts` | role-match |
| `extension/src/offscreen/offscreen.ts` | controller | streaming | existing file | exact |
| `extension/src/offscreen/silence.ts` (proposed) | utility | streaming | offscreen capture lifecycle only | partial |
| `extension/src/offscreen/earcons.ts` (proposed) | service | event-driven | offscreen AudioContext ownership only | partial |
| `extension/src/content/live-region.ts` | service | event-driven | existing file | exact |
| `extension/src/content/index.ts` | controller | request-response | existing file | exact |
| `extension/src/content/executor.ts` | service | request-response | existing file | exact |
| `extension/src/options/options.ts` | controller | event-driven | existing file | exact |
| `extension/static/options.html` | component | event-driven | existing file | exact |
| `extension/src/background/proxy.ts` | service | request-response | existing file | exact |
| shared request builder (path to choose) | utility | transform | `extension/src/background/proxy.ts` | role-match |
| existing pipeline/proxy tests | test | request-response | existing tests | exact |
| new offscreen/options/policy unit tests | test | event-driven | `extension/src/background/pipeline.test.ts` | role-match |
| new browser scenarios: cancellation/settings/preview | test | event-driven | `extension/e2e/scenarios/onboarding.mjs`, `privacy.mjs` | role-match |

## Pattern Assignments

### Cancellation and output routing

**Primary analog:** `extension/src/background/pipeline.ts`. Preserve its explicit relative `.ts` imports, separate `import type`, and centralized Polish messages (lines 1–24). The owner signal and serialized state updates are the useful patterns; existing unconditional TTS fallback is behavior to replace.

Lines 113–125:
```typescript
export function runSerial<T>(task: () => Promise<T>): Promise<T> {
  const run = serial.then(task, task);
  serial = run.catch(() => {});
  return run;
}
const controllers = new Map<string, AbortController>();
function turnSignal(id: string): AbortSignal {
  let controller = controllers.get(id);
  if (!controller) { controller = new AbortController(); controllers.set(id, controller); }
  return controller.signal;
}
function abortTurn(id: string | undefined): void { if (id) { controllers.get(id)?.abort(); controllers.delete(id); clearWaits(id); } }
```

Lines 129–136:
```typescript
const turn = await getTurn();
if (turnSignal(turnId).aborted || turn.id !== turnId) return false;
if (turn.phase === 'processing' && !turn.outputClaimed) await setTurn({ ...turn, outputClaimed: true });
return true;
// speakTurn:
if (!(await runSerial(() => claimOutput(turnId)))) return;
await announce(tabId, text, intent);
```

Apply to pipeline, command entrypoint and new output work. Immediate TTS stop/local abort must precede waiting on `runSerial`; durable invalidation must clear pending interaction and effect jobs even when idle. Fence again after awaited delivery before replay storage. Keep output intents from `conversation.ts:49–52`: substantive/status/pre_action/replay; only substantive delivery updates replay. Existing `pipeline.ts:67–85` acknowledges page delivery before storing it, but needs cancellation-aware acknowledgements and one selected output route.

**Message boundary:** `background/index.ts:6–12` validates extension sender, top frame/tab and payload fields before final execution acknowledgement:
```typescript
void handleExecuting(sender.tab.id, message).then(ok => respond({ ok }), () => respond({ ok: false }));
return true;
```
Apply the async response pattern to preview/settings messages, adding trusted options URL and absence of tab sender; sender id alone is insufficient. Extend protocol definitions/decoders rather than introducing unchecked ad hoc messages. Stop command must dispatch without requiring the shortcut tab.

**Content effect fence:** `content/executor.ts:23–24,41–47`:
```typescript
await announcer.announce(verdict.kind === 'click' ? clickPre(name) : fillPre(name));
await new Promise(resolve => setTimeout(resolve, 300));
// after live target revalidation:
if (!(await commit())) return { ok: false, reason: 'unconfirmed' };
const final = resolveTarget(proposal.target, epoch, opts.context), finalVerdict = validateProposal(proposal, final.target, opts);
if (!finalVerdict.ok) return finalVerdict;
if (final.element !== element) return { ok: false, reason: 'stale' };
const settled = startSettleWatch({ ignore: el => announcer.host.contains(el) });
if (verdict.kind === 'click') element.click();
```
Apply local generation cancellation around delays and immediately before effects, retaining worker commit and live target checks. Also route/fence the scroll announcement in `content/index.ts:49–58`. Cancellation does not undo committed DOM effects.

**Live queue:** `content/live-region.ts:17–24`:
```typescript
while (queue.length) {
  for (const node of nodes) node.textContent = '';
  await sleep(60);
  const item = queue.shift()!;
  nodes[next]!.textContent = item.text;
  item.written();
  next = 1 - next;
  await sleep(300);
}
```
Reuse alternating status nodes, but replace the unchecked shift with generation-aware cancellation and settle removed entries as cancelled. DOM mutation acknowledgement is not proof of audible NVDA delivery.

### Settings, local commands and options

**Primary analog:** `shared/conversation.ts:21–30,34–41`. Complete normalized phrase matching must be reused for local spoken stop (before pending/model routing); do not match a substring inside dictation.
```typescript
export function normalizePhrase(text: string): string {
  return foldPolish(text).replace(/[.,!?;:"'„”…]/gu, ' ').replace(/\s+/gu, ' ').trim();
}
export const VERBOSITY_LEVELS: readonly Verbosity[] = ['concise', 'standard', 'detailed'];
export const DEFAULT_VERBOSITY: Verbosity = 'standard';
export function decodeVerbosity(value: unknown): Verbosity {
  return value === 'concise' || value === 'standard' || value === 'detailed' ? value : DEFAULT_VERBOSITY;
}
```
Reuse existing verbosity storage key and unknown-input decoding for settings; no second verbosity preference. `pipeline.ts:96–97` reads local storage per use with a decoder fallback on read failure. Mode switches require cancellation of old output, not only a stored preference change.

**UI analog:** `static/options.html:8–11`:
```html
<button type="button" id="grant-mic" autofocus>Włącz mikrofon</button>
<p id="mic-status" role="status" aria-live="polite"></p>
<h2>Skrót klawiszowy</h2>
<p id="shortcut-info" role="status"></p>
```
Extend native labeled controls/fieldset groups; preserve mic grant and Polish status feedback. `options/options.ts:5–18` uses `getUserMedia`, immediately stops acquired tracks, writes fixed status messages through `textContent`, and reads actual command bindings with `chrome.commands.getAll()`. Use the same text-only approach for preview; never automatically speak its full payload.

### Offscreen discard, silence and cues

**Primary analog:** `offscreen/offscreen.ts:14–29`:
```typescript
clearTimeout(c.timer);
c.source?.disconnect(); c.processor?.disconnect();
if (c.processor) c.processor.onaudioprocess = null;
c.stream?.getTracks().forEach(track => track.stop());
// discard:
c.discarded = true; c.abort.abort(); void release(c);
if (c.recorder && c.recorder.state !== 'inactive') {
  c.recorder.ondataavailable = null; c.recorder.onstop = null; c.recorder.onerror = null;
  try { c.recorder.stop(); } catch { /* already stopped */ }
}
if (current === c) current = undefined;
```
Extend single-owner release to detector timers/graphs and cue sources. Distinguish discard from `stop` (lines 62–68), which finalizes/uploads normally. Preserve opening-race discarded checks (line 76), WAV cleanup before upload (51–60), WebM onstop discarded guard (100–103), and 25-second cap. Normal silence finalization must happen once in either format.

`offscreen.ts:13` suppresses all late discarded events:
```typescript
const emit = (c: Capture, body: FromOffscreenBody): Promise<void> => c.discarded ? Promise.resolve() : chrome.runtime.sendMessage({ target: 'sw', turnId: c.turnId, ...body }).then(() => {}, () => {});
```
Reuse owned events for cue timing. VAD analysis and oscillator cue generation are new algorithms: use research platform examples, pure tested policy and actual audio acceptance. Do not copy the WAV processor-to-destination connection for microphone analysis; analyzer must not feed speakers. Add playback reason to existing offscreen creation seam where required.

### Exact local privacy preview

**Primary analog:** `background/proxy.ts:9–15`:
```typescript
export function assertEgressClean(serialized: string): void {
  if (maskText(serialized) !== serialized) throw new EgressBlockedError('unsafe_egress');
}
const serialized = JSON.stringify(body);
assertEgressClean(serialized);
```
Extract the pure request representation/serialization and reuse identical checked bytes for preview and dispatch. Keep rejection of unsafe data; do not re-mask only the preview. Preview must not call fetch/transcription/model/effect, persist payloads or mutate targeting state. Coordinate document/owner/pending guards and preserve masked snapshot construction. Exact page-derived body versus full backend envelope remains the research's explicit scope question.

Error handling analog is `proxy.ts:24–36`: errors become fixed `FailureKind` categories; raw provider messages never become UI/speech/logs. Apply this to preview/save/output failures using centralized `shared/messages.pl.ts` text.

### Unit and browser verification

**Node analog:** `background/pipeline.test.ts:1–37` installs fake chrome storage, runtime, tabs and TTS before dynamic pipeline import; mutable handlers and fault toggles allow deterministic failure/race coverage. Lines 39–49 test simultaneous commands with `Promise.all` and inspect owner plus emitted messages. Extend this adapter with TTS terminal events/stop and held asynchronous gates, not timing-only sleeps.
```typescript
await Promise.all([pipeline.handleToggle({ id: 7, url: 'https://example.com/' } as chrome.tabs.Tab), pipeline.handleToggle({ id: 22, url: 'https://example.com/' } as chrome.tabs.Tab)]);
assert.deepEqual(sent.map(m => m.type), ['REC_START', 'REC_STOP']);
const state = await turn();
assert.equal(state.tabId, 7); assert.equal(state.phase, 'processing');
```

**Browser analog:** `e2e/scenarios/onboarding.mjs:1–17` exports `name`, optional `freshBrowser`, and `run(ctx)`, attaches to options by URL and drives real keyboard CDP events:
```javascript
await ctx.client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, session);
await ctx.client.send('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', code: 'Enter', text: '\r', windowsVirtualKeyCode: 13 }, session);
await ctx.client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, session);
```
Extend with Tab/Shift-Tab/Space/arrows, native label-role-state, persistence/save failure and plain-text preview checks. Existing fallback-TTS expectation at onboarding lines 20–23 must change with explicit output policy.

`e2e/scenarios/privacy.mjs:4–17` uses sensitive fixture, upstream marks and positive parcel controls:
```javascript
const mark = await ctx.upstreamMark();
const request = (await ctx.upstreamSince(mark)).find(r => r.response_format.json_schema.name === 'action_proposal');
const content = request.messages.findLast(m => m.role === 'user').content;
assert((content.match(/\[ukryte\]/g) ?? []).length >= 10);
assert(content.includes('873234987612340872938732'));
assert(content.includes('123456789012345678901234'));
```
Reuse fixture/marks for no-network preview assertions, exact body equivalence with frozen inputs, secret negative controls and ordinary parcel positives. Add cancellation browser scenarios at both sides of commit, stale output and capture opening/upload races. Keep NVDA, Polish voice, real microphone silence and distinguishable cue acceptance manual; CDP cannot prove those outcomes.

## Shared Patterns

- Relative `.ts` imports, explicit type imports and centralized Polish messages.
- Decode unknown stored/messages data; preserve strict sender, tab, document and owner boundaries.
- Persist durable operational ownership in session storage; preferences in local storage; preview only in ephemeral memory.
- Abort HTTP work and independently suppress stale results; client abort is not proof provider computation stopped.
- Safe typed failures and text-only DOM writes; do not log preview/provider/speech bodies.

## No Analog Found

| New behavior | Role/Data Flow | Reason |
|---|---|---|
| RMS speech onset/trailing-silence detector | utility / streaming | Existing capture provides lifecycle, no VAD policy |
| Five distinct earcon synthesis patterns | service / event-driven | Existing AudioContext is WAV capture, no tone player |
| Non-mutating coordinated preview acquisition | controller / request-response | Existing snapshot message publishes targeting state; new safe preview contract needed |

## Metadata

**Search scope:** tracked `extension/src`, `extension/static`, `extension/e2e`.
**Primary analog families:** pipeline, conversation/settings, offscreen lifecycle, proxy egress, Node/CDP tests. Supporting content/options files inspected for actual integration seams.
**Pattern extraction date:** 2026-10-04. No implementation or test execution claimed by this mapping.
