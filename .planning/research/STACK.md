# Stack Research

**Domain:** Chrome MV3 voice agent for blind users on Polish websites (InPost tracking demo), ~24h hackathon, 2-3 devs
**Researched:** 2026-10-03
**Confidence:** HIGH on extension architecture and proxy; MEDIUM on audio-format interop with the teammate's Whisper module and on live-region timing quirks (both need a 15-minute smoke test in phase 1)

## Headline Decisions (read this first)

1. **No bundler, no TypeScript, no framework in the extension.** Plain JS. ES modules for the service worker and offscreen document, classic multi-file scripts for the content script. Load unpacked. Zero npm dependencies in the extension.
2. **Mic capture = offscreen document (`USER_MEDIA`) + a one-time permission grant from a visible extension page (options page).** Never `getUserMedia` from a content script (permission would be per-website, prompt appears inside inpost.pl).
3. **Record `audio/webm;codecs=opus` with `MediaRecorder`**, one Blob on stop. OpenRouter's transcription endpoint accepts `webm`. Keep a WAV encoder as a documented fallback only if the teammate's module rejects webm.
4. **Page understanding = our own DOM walker producing a compact, AX-like snapshot** (role, accessible name, state, stable short id). NOT `chrome.debugger` / CDP Accessibility.
5. **Proxy = Hono 4 + `@hono/node-server`**, two routes, ~100 lines. Same code deploys unchanged to Cloudflare Workers if the demo needs a public HTTPS URL.
6. **LLM = `anthropic/claude-sonnet-5.5` through OpenRouter chat completions with `response_format: json_schema` (strict)** returning one action proposal. Tool calling is the documented fallback. The extension re-validates everything.
7. **Output voice = ARIA live region in the page (primary), `chrome.tts` (pl-PL) as fallback, earcons via Web Audio oscillators in the offscreen document.**
8. **Push-to-talk = `chrome.commands` toggle (press to start, press to stop, plus silence auto-stop).** `chrome.commands` has no keyup event, so true hold-to-talk is impossible there.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended | Confidence |
|------------|---------|---------|-----------------|------------|
| Chrome Manifest V3 | `manifest_version: 3`, target Chrome 148+ | Extension platform | Fixed by project. Chrome 148+ unlocks `message_serialization: "structured_clone"` so Blobs can go through `runtime.sendMessage` without base64. Demo laptops must run current stable Chrome. | HIGH |
| Plain JavaScript (ES2022) + JSDoc | none | All extension code | No build step means no build failures at hour 20, instant reload at `chrome://extensions`, and every teammate can edit any file. Content scripts cannot be static ES modules anyway, so a bundler would be the only way to share modules and we do not need it at this size (~1.5-2.5k LOC). | HIGH |
| `chrome.offscreen` (reasons `USER_MEDIA`, `AUDIO_PLAYBACK`) | Chrome 109+ | Microphone recording and earcon playback | Service workers have no DOM/MediaRecorder. Offscreen is the only MV3-sanctioned place for `getUserMedia` in the background. One offscreen doc may declare several reasons. | HIGH |
| `MediaRecorder` + `getUserMedia({audio})` | built in | Capture PTT audio | Native, zero deps. Default Chrome container is webm/opus, small (~3-4 KB/s at 32 kbps). | HIGH |
| `chrome.commands` | built in | Global-in-browser PTT / stop shortcuts | Declarative, user-rebindable at `chrome://extensions/shortcuts`, works with the screen reader running. Max 4 suggested keys; must use Ctrl or Alt; Ctrl+Alt is disallowed. | HIGH |
| Content script (isolated world, `document_idle`) | built in | DOM snapshot, masking, action execution, live region | Only context that can see and act on the page. | HIGH |
| `chrome.tts` | built in, needs `"tts"` permission | Fallback speech (pl-PL) and barge-in via `chrome.tts.stop()` | Callable from the service worker (no page interference, unlike `window.speechSynthesis` in the content script which the page can `cancel()`), has `onEvent` for end-of-speech, `stop()` is reliable. Still the same Chrome voices as `speechSynthesis`. | MEDIUM-HIGH |
| Hono | 4.13.12 | Proxy web framework | Web-standard `Request`/`Response`, built-in `cors`, `bodyLimit`, tiny (~1.3 MB unpacked, 0 runtime deps), and `app.fetch` runs on Node, Cloudflare Workers, Bun. | HIGH |
| `@hono/node-server` | 2.1.3 (peer `hono ^4`, Node >=20) | Run Hono on Node locally | `serve({ fetch: app.fetch, port })`. | HIGH |
| Node.js | 22 LTS or newer (dev machine has 26.8.2; engines need >=20) | Proxy runtime | Native `fetch`, `FormData`, `Blob`, `--env-file`, `--watch`. No `dotenv`, no `nodemon`. | HIGH |
| OpenRouter chat completions | `POST https://openrouter.ai/api/v1/chat/completions` | LLM gateway | Decided. OpenAI-compatible; no SDK needed. | HIGH |
| `anthropic/claude-sonnet-5.5` | model id verified live against `/api/v1/models` on 2026-10-03 | Intent + page state -> action proposal | Newest Sonnet on OpenRouter, $2/M in, $10/M out, 1M context, advertises `structured_outputs`, `response_format`, `tools`, `tool_choice`. Page snapshots are a few thousand tokens so cost is negligible; latency is the constraint (see Pitfalls). | MEDIUM-HIGH (model list changes weekly; re-check id on demo day) |
| OpenRouter STT | `POST /api/v1/audio/transcriptions`, model `openai/whisper-large-v3-turbo` (or `openai/whisper-1`) | Polish transcription (teammate's module) | Accepts JSON base64 `input_audio {data, format}` or OpenAI-style multipart (25 MB cap). Formats: wav, mp3, flac, m4a, ogg, webm, aac. Optional `language` (ISO-639-1: send `pl`). Response `{ text, usage }`. Whisper models are duration-priced. | HIGH for the endpoint, MEDIUM for webm/opus quirks |

### Supporting Libraries

There are deliberately almost none.

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none in extension) | - | - | Hand-write the ~40-line action validator and the ~150-line DOM walker. Every dependency in the extension forces a bundler. |
| `zod` | 4.6.5 | Schema validation on the proxy | Only if someone wants typed validation of proxy request bodies. Not required: the proxy is a thin pass-through with a model allowlist. Skip by default. |
| `dom-accessibility-api` | 0.7.1 | Spec-accurate accessible name computation | Only if hand-rolled name computation proves wrong on a target page AND you have adopted a bundler. Default: do not use. |
| `wrangler` | 4.147.0 | Deploy the same Hono app to Cloudflare Workers | Only if the demo/blind-user test needs a public HTTPS proxy and localhost is not enough. Dev-time only, run via `npx`. |
| `@types/chrome` | 0.3.4 (npm `latest`) | Editor autocomplete for `chrome.*` via `// @ts-check` + JSDoc | Optional, dev-only, installed in a root `devDependencies`. Gives type hints with no build step. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `node --test` (built-in `node:test`) | Unit tests for pure logic: sensitive-field masking, action validator, number-to-words | Zero deps. Put pure functions in files that work both as classic scripts and under Node (`globalThis.X = ...` guarded export). Test masking first; it is the headline privacy claim. |
| `node --env-file=.env --watch server/index.js` | Proxy dev loop | `.env` holds `OPENROUTER_API_KEY`; `.env` is gitignored (verify `.gitignore` before first commit). |
| `chrome://extensions` + "Inspect views" | Debug service worker, offscreen doc, options page | Offscreen document appears as an inspectable view while open. |
| NVDA (Windows) or VoiceOver (macOS) | Mandatory manual acceptance test | Per CLAUDE.md: every UI element and the live region must be tested with a real screen reader. |

## Detailed Rationale per Question

### 1. Microphone capture in MV3

**Recommended pattern (HIGH confidence on the pattern, MEDIUM on every edge case):**

- `manifest.json`: `"permissions": ["offscreen", "commands"?, "storage", "tts", "scripting"?]`, an `options_ui`/`options_page` (we need an accessible settings page anyway), `host_permissions` for the proxy origin and the target sites.
- **Permission grant happens once, in a visible extension page.** An offscreen document cannot show the microphone permission prompt itself (it is invisible); `getUserMedia` there fails with `NotAllowedError` unless the extension origin (`chrome-extension://<id>`) already has mic permission. So `options.html` has a button "Przyznaj dostep do mikrofonu" that calls `navigator.mediaDevices.getUserMedia({audio:true})`, immediately stops the tracks, and announces the result in a `role="status"` region. Also open it from `runtime.onInstalled` via `chrome.tabs.create`. Permission persists for the extension origin.
- **Recording runs in the offscreen document** created lazily with `chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA','AUDIO_PLAYBACK'], justification: 'Record push-to-talk audio and play earcons' })`. Guard with `chrome.runtime.getContexts({contextTypes:['OFFSCREEN_DOCUMENT']})` (only one offscreen doc allowed per profile). `AUDIO_PLAYBACK` documents are closed by Chrome after 30 s without audio, so write `ensureOffscreen()` and call it before every message; do not assume it is alive.
- Only the `chrome.runtime` API exists in offscreen docs. Message flow: service worker -> `runtime.sendMessage({target:'offscreen', type:'start'|'stop'})`; offscreen -> SW with the result.
- **Do NOT call `getUserMedia` from the content script.** It runs under the page origin, so the prompt appears per website inside inpost.pl (a screen-reader-hostile page-level dialog), can be blocked by the site's Permissions-Policy, and is stored per origin.
- **Do NOT use `chrome.tabCapture`.** That captures tab audio, not the user's voice.
- **Do NOT use the Web Speech API (`SpeechRecognition`)** for STT: decision is Whisper; it is also unreliable in extension contexts and sends audio to Google.
- **Stable extension ID:** put a `"key"` in `manifest.json` (generate once, commit the public key). Without it every teammate's unpacked install gets a different ID, so the mic permission grant, any proxy origin check, and shortcut bindings differ per machine.
- **Clipped first word:** `getUserMedia` takes 100-400 ms to start. Play the "listening" earcon only after `MediaRecorder.onstart` fires, and tell the team to wait for the tone. Do not keep the mic open permanently (privacy differentiator, and the browser's recording indicator would stay on).
- **Release the mic** (`stream.getTracks().forEach(t => t.stop())`) after every utterance.
- **Silence auto-stop:** `AudioContext` + `AnalyserNode` RMS in the offscreen doc, stop after ~1.2 s below threshold or at 15 s max. This is what makes a toggle shortcut feel like push-to-talk.
- Blob transport: add `"message_serialization": "structured_clone"` to the manifest (Chrome 148+ only; older Chrome silently falls back to JSON and Blobs arrive as `{}`). Safer alternative that works on any Chrome: **let the offscreen document `fetch` the proxy `/api/transcribe` itself** (offscreen docs are normal extension pages; with `host_permissions` for the proxy no CORS applies) and send only the resulting text to the service worker. This removes any Blob-over-messaging risk and is the recommended default; keep structured clone enabled as a convenience for the teammate's module if it wants the Blob.

### 2. Audio format for Whisper

- **Primary:** `new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 })`; collect chunks, `new Blob(chunks, {type:'audio/webm'})` on `onstop`. Send as multipart `file` (OpenAI-style) or base64 `input_audio {format: 'webm'}`. OpenRouter documents `webm` and `ogg` as accepted. Mono, `echoCancellation: true`, `noiseSuppression: true` constraints.
- **Always send `language: "pl"`**: it prevents Whisper from guessing Russian/Ukrainian on short utterances and from hallucinating on silence. (`prompt` is accepted but ignored on multipart, so do not rely on vocabulary hints; post-correct "InPost"/"paczka" in the model prompt instead.)
- **Known risk (MEDIUM):** MediaRecorder webm has no duration header; OpenAI's pipeline copes via ffmpeg, but individual routed providers (e.g. Groq-hosted Whisper) have historically been pickier. **Smoke-test webm through the teammate's module in the first hour.** If it fails, fall back to **16 kHz mono 16-bit PCM WAV** encoded in the offscreen doc (AudioWorklet or ScriptProcessor; ~32 KB/s, ~320 KB for a 10 s command, trivially under limits). Write the 44-byte WAV header by hand, no library.
- **Agree the interface now with the teammate:** `transcribe(blob: Blob, { language: 'pl' }) => Promise<{ text: string }>`, called from the offscreen document or proxy route `/api/transcribe`. Everything else is their problem.
- Skip VAD libraries (Silero etc.) and streaming STT: whole-utterance transcription on 2-8 s clips is fast enough and far simpler.

### 3. Page understanding: DOM walking beats `chrome.debugger`

**Decision: own DOM walker in the content script. Confidence HIGH.**

| Criterion | `chrome.debugger` + `Accessibility.getFullAXTree` | DOM walker (recommended) |
|-----------|-----------------------------------------------------|---------------------------|
| UX side effects | Yellow "extension is debugging this browser" bar on every attach; requires the scary `debugger` permission | None |
| Interference | Attaching can clash with the DevTools Network-tab check CLAUDE.md requires for the privacy demo | None |
| Acting on elements | Returns `backendDOMNodeId`; clicking/typing needs more CDP round trips (`DOM.resolveNode`, `Input.*`) | Direct `element.click()`, value setters |
| Accuracy of names/roles | Excellent (Chrome's real tree) | Good enough for forms/links/buttons if you cover aria-label, aria-labelledby, `<label for>`, wrapping label, `alt`, `title`, `placeholder`, text content |
| Masking sensitive fields | Must post-process the CDP tree anyway | Done at source, before data ever leaves the content script (stronger privacy story) |
| Cost | Large async plumbing | ~150-250 lines |

**How to build the snapshot (patterns, not libraries):**
- Walk `document.body`, including open shadow roots; skip `hidden`, `aria-hidden="true"`, `display:none`, `visibility:hidden`, zero-size, `inert`, `<script>/<style>`.
- Emit only: landmarks/headings (role + text), links, buttons, inputs/selects/textareas/checkboxes/radios (role, name, state: disabled/checked/required/expanded, **value only if non-sensitive**), and visible status/alert text. Truncate text to ~120 chars per node, cap total nodes (~250) and prioritise the viewport and the main landmark.
- Give each interactive element a short id (`e1`, `e2`, ...) kept in a content-script `Map<string, WeakRef<Element>>`. **Do not write attributes into the page DOM** (frameworks can re-render and drop them; mutations also trigger the page's own observers). The model returns `target: "e7"`; the content script resolves it. Rebuild the map on every snapshot and reject stale ids.
- Include an `url`, `title`, and a `dialogs`/overlay flag. InPost uses a Didomi cookie-consent overlay; the snapshot must surface it (it blocks the page and accepting cookies is a legal consent, so it falls under the confirmation rule).
- **Sensitive masking at the source:** `type=password`, `autocomplete` in (`cc-number`, `cc-csc`, `cc-exp`, `one-time-code`, `current-password`, `new-password`), name/id/label/placeholder regex (`pesel|iban|nrb|cvv|cvc|karta|blik|pin|kod sms|haslo`), plus value-pattern checks (PESEL 11 digits with checksum, `PL` IBAN, Luhn 13-19 digits). Replace the value with `"[ukryte]"`, and never include it in any message. Do not mask the InPost parcel number (24 digits, not Luhn-checked, not an IBAN).
- Re-snapshot after actions with a settle heuristic: `MutationObserver` + 400 ms quiet window, 3-4 s hard timeout. No library.
- **Executing actions in framework-built pages:** for inputs use the native value setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, v)`) then dispatch `input` and `change` events with `bubbles:true`; for clicks use `el.click()` after `scrollIntoView({block:'center'})`. Plain `el.value = x` is silently ignored by React/Angular-controlled inputs.
- The InPost tracking page (checked 2026-10-03) is server-rendered Drupal with a plain `<form class="tracking-form">`, an `<input minlength=8 maxlength=24>` and a Didomi consent layer. A DOM walker is a perfect fit; no shadow DOM at load. The result panel is rendered later, so the settle logic matters.

### 4. Proxy server: Hono

**Recommendation: Hono 4.13.12 + @hono/node-server 2.1.3. Confidence HIGH.**

- Why not zero-dependency `node:http`? It is viable for 2 routes, but hand-rolled CORS/preflight, body size limits and error mapping are exactly the bugs that eat hackathon hours. Hono's built-ins cover them and the app is portable to Cloudflare Workers (public HTTPS in one command) if localhost will not do.
- Why not Express 5.2.1? Works, but needs `cors`, `multer`/body parsers, is not Workers-portable, and has more transitive deps.
- Routes (all JSON, no streaming; responses are short):
  - `POST /api/chat`: allowlisted pass-through to OpenRouter `chat/completions`. Server forces `model` from an allowlist (default `anthropic/claude-sonnet-5.5`), clamps `max_tokens` (~600) and rejects bodies over ~200 KB (`hono/body-limit`). Prompt and JSON schema live in the **extension**, not the proxy, so prompt iteration needs only an extension reload.
  - `POST /api/transcribe`: forwards the audio to `/api/v1/audio/transcriptions` (multipart pass-through or base64 JSON), forces `language: 'pl'` when absent. (Or the teammate's module replaces this route; keep the URL stable.)
  - `GET /health`: for pre-demo checks.
- **Key hygiene:** `OPENROUTER_API_KEY` only in `server/.env` / host env; set a **credit cap on the OpenRouter key** and send `HTTP-Referer`/`X-Title` headers. The proxy URL is public once deployed, so add a shared `X-Demo-Token` header (value in extension storage via the options page, never in the repo) and a trivial in-memory per-IP rate limit. A token in the extension is extractable, so this only deters casual abuse; the credit cap is the real protection. State this honestly in the presentation.
- **Privacy note to keep honest:** the proxy and OpenRouter do see the masked snapshot and the transcribed command. Never log request bodies in the proxy (CLAUDE.md rule); log only status codes and latency.
- Extension -> proxy calls come from the **service worker or offscreen document** (never the content script, whose `fetch` is subject to the page's CORS/CSP). With the proxy origin in `host_permissions` no CORS configuration is required; still add `cors({ origin: 'chrome-extension://<id>' })` as defence in depth.
- Cold-start: if deployed on a free serverless tier, ping `/health` at extension start; or prefer plain localhost for the demo with a tethered laptop (plan B: canned responses, see Pitfalls).

### 5. OpenRouter structured output / tool calling with Claude

**Recommendation: `response_format: { type: 'json_schema', json_schema: { name, strict: true, schema } }` as the primary path, with `provider: { require_parameters: true }`. Forced tool call is the fallback. Confidence MEDIUM-HIGH.**

- Verified: OpenRouter lists `structured_outputs`, `response_format`, `tools`, `tool_choice` for `anthropic/claude-sonnet-5.5`. Anthropic documents structured outputs (JSON outputs + strict tool use) as GA for Sonnet 5.5 and the other current Claude models.
- OpenRouter caveats: structured-output support is per provider endpoint, so `require_parameters: true` stops silent routing to an endpoint that ignores the schema; `strict: true` enforcement varies by provider.
- **Schema rules (Anthropic grammar-constrained decoding):** every object needs `additionalProperties: false` and all fields in `required`; no `minLength/maxLength/minimum/maximum`; no recursion; `enum`, `anyOf`, `const` fine. First request with a new schema pays extra grammar-compile latency; compiled grammars are cached for 24 h and survive changes to descriptions only. **Warm it up at proxy/extension start** and freeze the schema before demo day.
- Suggested single-schema action proposal (flat, enum-driven):
  ```json
  {
    "action": "say | click | type | scroll | navigate | ask_clarification | confirm_required | stop_blocked | done",
    "target": "e7 | null",
    "text": "string or null (value to type or scroll direction)",
    "say": "string (Polish, 1-2 sentences, shown/spoken to user)",
    "needs_confirmation": "boolean",
    "reason_blocked": "string or null (password | captcha | sms_code | blik | none)"
  }
  ```
  Nullable via `anyOf [{type:string},{type:null}]` or `"type": ["string","null"]`, test which one OpenRouter forwards cleanly.
- **The model never gets the last word.** The service worker/content script validates: `target` exists in the current snapshot map; `type` into a sensitive field is rejected regardless of what the model said; irreversible-looking actions (submit/pay/delete/consent buttons, detected by name regex and `type=submit` in forms other than the tracking form) force `needs_confirmation = true` on the extension side; unknown actions fail closed. Do not trust `needs_confirmation: false` from the model.
- Fallback path if json_schema misbehaves through OpenRouter: one tool `propose_action` with the same schema as `parameters`, `tool_choice: {type:'function', function:{name:'propose_action'}}`, `parallel_tool_calls: false`; parse `choices[0].message.tool_calls[0].function.arguments` (a JSON **string**, `JSON.parse` it). Keep both code paths behind one `callModel()` function; do not implement an agent loop, one request per user turn.
- **Request shape:** system prompt (static, Polish style rules from CLAUDE.md section 4, safety rules, schema semantics) + a short rolling history (last 3-4 turns, held in `chrome.storage.session`, not SW memory) + user message containing `{ utterance, snapshot }`. Temperature 0-0.2. `max_tokens` ~400. Prompt caching (`cache_control` on the static system block) is optional; skip until latency is measured.
- **No SDK.** Plain `fetch` to `https://openrouter.ai/api/v1/chat/completions`. `openai` (7.27.0) or `@openrouter/sdk` (1.4.21) would add a dependency to a ~30-line call.
- Model choice caveat: Sonnet-class is the right quality floor for "which of these 40 elements did the user mean", but expect ~2-5 s per call. If the live demo feels slow, benchmark a faster non-Anthropic model with strong Polish (e.g. `google/gemini-3.8-flash`, $0.75/$3.75 per M) behind the same `callModel()`; no Claude Haiku appeared in OpenRouter's current catalogue on 2026-10-03.

### 6. Output: ARIA live region, TTS fallback, earcons

- **Live region** (content script, light DOM, appended to `document.body`): `<div id="..." role="status" aria-live="polite" aria-atomic="true">` for results, a second `role="alert"` (assertive) region for blocked/needs-confirmation/errors. Hide with the "visually hidden" clip pattern (`position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%)`), **never `display:none` or `hidden`** (not announced).
  - Create regions at load, then set `textContent` after ~100-150 ms delay in a fresh task; screen readers only announce changes to regions that already exist.
  - To repeat identical text, clear then set (or append a trailing non-breaking space).
  - Page frameworks may re-render `body` children; call `ensureLiveRegion()` before every announce and re-insert if detached.
  - Keep each announcement to 1-2 short sentences (also avoids NVDA queue floods). Confidence MEDIUM: community practice, verify with NVDA early.
- **Fallback speech:** `chrome.tts.speak(text, { lang: 'pl-PL', rate: 1.0, onEvent })` from the service worker (needs `"tts"` permission); `chrome.tts.stop()` for barge-in. Trigger fallback via a setting ("Mow wlasnym glosem") and automatically when no screen reader is detected is impossible to know reliably, so make it an explicit toggle, default off. Keep utterances short: Chrome's online Google voices are known to cut off long utterances. Polish voice availability depends on the machine (`chrome.tts.getVoices()`); check once at startup and tell the user if missing.
- **Earcons:** `OscillatorNode` beeps generated in the offscreen document (`AUDIO_PLAYBACK`), no audio files, so no asset or bundler concerns, and no page autoplay-policy issues. Three distinct tones (e.g. rising = listening, double short = done, low-high pair = needs confirmation), each ~80-150 ms, toggle stored in `chrome.storage.sync`. Do not play earcons through the page's `AudioContext` (autoplay policy blocks it without page user activation).
- **Barge-in:** second `chrome.commands` shortcut ("Stop") plus voice "stop" detected in the transcript; stop = `chrome.tts.stop()`, abort in-flight `fetch` via `AbortController`, `MediaRecorder.stop()`, cancel pending action queue, clear live region.

### 7. Build tooling: none (and when to change)

| Option | Verdict | Reason |
|--------|---------|--------|
| Plain JS, load unpacked | **Use** | No toolchain risk, instant iteration, matches the "no dependency without a reason" rule |
| WXT 0.21.4 | Skip for the hackathon | Excellent DX (HMR, auto-manifest, TypeScript), but adds Vite + node_modules + a framework convention to learn in a 24 h window; peer-needs Vite 6.3+/7/8 |
| Vite 8.3.2 + `@crxjs/vite-plugin` 3.0.0 (peer supports Vite 8; npm `latest`, modified 2026-09-24) | Skip | Only worth it if the team wants TypeScript + shared modules across content script/SW. CRXJS has a history of version-lag and HMR quirks with MV3 service workers |
| esbuild 0.28.2 | Fallback | If, midway, someone insists on TypeScript or npm imports, a single `esbuild src/*.ts --bundle --outdir=ext` command is the least-risk addition. Decide at hour 0, not hour 12 |
| TypeScript (npm shows 7.0.2) | Skip | Use `// @ts-check` + JSDoc + `@types/chrome` for hints if desired |

**Extension file layout that works without a bundler:**
- `manifest.json`: `"background": { "service_worker": "sw.js", "type": "module" }`; `"content_scripts": [{ "matches": [...], "js": ["cs/masking.js", "cs/snapshot.js", "cs/actions.js", "cs/live-region.js", "cs/main.js"], "run_at": "document_idle" }]` (classic scripts share one isolated-world scope, in array order; no `import`).
- `sw.js` and `offscreen.js`/`options.js` can use real `import` (module SW, module scripts in HTML pages).
- Share pure code (masking, validator) between content script and Node tests via a tiny UMD-ish footer: `if (typeof module !== 'undefined') module.exports = {...}; else globalThis.GSDMask = {...}`.
- `content_scripts.matches`: for the hackathon restrict to `https://inpost.pl/*` and the local mock (`http://localhost:*/*`). A narrow host list is itself a privacy talking point; "all sites" becomes optional host permissions on the what's-next slide.
- Keep conversation state, pending confirmation and settings in `chrome.storage.session`/`sync`, **not module-level variables**: the MV3 service worker is killed after ~30 s idle and loses memory. Re-hydrate on every event.

## Installation

```bash
# Extension: nothing to install. Load /extension as unpacked at chrome://extensions
# (Developer mode -> Load unpacked). Optional editor types only:
npm install -D @types/chrome@0.3.4

# Proxy (server/ directory)
cd server
npm init -y
npm install hono@4.13.12 @hono/node-server@2.1.3
# Run (Node >=20.6):
node --env-file=.env --watch index.js      # .env: OPENROUTER_API_KEY=..., DEMO_TOKEN=...

# Optional public deploy of the same app (only if localhost is not enough)
npx wrangler@4.147.0 deploy
```

Minimal proxy skeleton (shape only):

```js
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { serve } from '@hono/node-server'

const app = new Hono()
app.use('/api/*', bodyLimit({ maxSize: 2 * 1024 * 1024 }))
app.use('/api/*', async (c, next) => {
  if (c.req.header('x-demo-token') !== process.env.DEMO_TOKEN) return c.json({ error: 'unauthorized' }, 401)
  await next()
})
app.post('/api/chat', async (c) => {
  const body = await c.req.json()
  body.model = ALLOWED_MODELS.has(body.model) ? body.model : DEFAULT_MODEL
  body.max_tokens = Math.min(body.max_tokens ?? 400, 600)
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return new Response(r.body, { status: r.status, headers: { 'Content-Type': 'application/json' } })
})
serve({ fetch: app.fetch, port: 8787 })
```

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Offscreen doc + permission page for mic | Open a small extension popup window / side panel that records | If the offscreen permission trick fails on a teammate's machine. Side panel (an extension page) can prompt for the mic directly, but it must stay open, which is bad for a blind user. Keep as last resort. |
| Offscreen doc + permission page for mic | iframe of `chrome-extension://` page injected in the page | Older workaround pattern for MV2-era extensions; fragile with page CSP and `web_accessible_resources`. Not needed in 2026. |
| DOM walker | `chrome.debugger` `Accessibility.getFullAXTree` | If, after the demo, you need exact roles/names on arbitrary sites (e.g. canvas-heavy or deeply custom widgets) and accept the infobar and permission warning. Post-hackathon. |
| DOM walker | Screenshot + vision model | Only for unlabeled/broken pages, with sensitive-field masking (CLAUDE.md). Out of MVP scope. |
| Hono | zero-dep `node:http` | If the team refuses any npm dependency; ~80 lines, but hand-write CORS, body limit and error handling. |
| Hono | Express 5.2.1 | If the team already knows Express and will never deploy to Workers. |
| `response_format: json_schema` | forced tool call (`propose_action`) | If OpenRouter routes to a provider endpoint that ignores strict schemas or returns invalid JSON; flip the flag in `callModel()`. |
| `chrome.tts` | `window.speechSynthesis` in the content script | Equivalent voices; use it only if you want the fallback to work without the `tts` permission. Page scripts can cancel it. |
| Plain JS | WXT 0.21.4 | If the team is already fluent in WXT/TypeScript and wants HMR; budget 1-2 h for setup. Not a hackathon default. |
| `anthropic/claude-sonnet-5.5` | `anthropic/claude-opus-5.5` ($4/$20) or `claude-sonnet-5` | Opus only if Sonnet misidentifies elements on the demo page; it is slower. Pin one id, do not use `~anthropic/...-latest` aliases (behaviour can change under you before the demo). |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `getUserMedia` in the content script | Prompts per website, inside the target page; blocked by Permissions-Policy on some sites | Offscreen doc + one-time grant in options page |
| `getUserMedia` first-time in the offscreen doc | Invisible context cannot show the prompt, fails with `NotAllowedError` | Grant in a visible extension page first |
| `chrome.tabCapture` / `getDisplayMedia` | Captures tab/screen audio, not the user's microphone | `MediaRecorder` on mic stream |
| `SpeechRecognition` (Web Speech API) | Decision is Whisper; poor/unsupported behavior in extension contexts; audio goes to Google | Whisper via the proxy |
| `chrome.debugger` for the AX tree | Infobar, scary permission, CDP plumbing, DevTools interference | DOM walker |
| Putting the OpenRouter key (or any key) in extension code, `chrome.storage`, `.env` committed to git, or a build-time constant | Violates the non-negotiable rule; extension packages are trivially unpacked | Proxy holds the key in env; extension holds only a demo token |
| Calling OpenRouter directly from the content script | Page CORS/CSP, and leaks the key if you cheat | Service worker -> proxy |
| Global variables for conversation/confirmation state in the SW | MV3 service worker is terminated when idle, state vanishes mid-confirmation ("tak" lost) | `chrome.storage.session` |
| Injecting `data-*` attributes or ids into page DOM to tag elements | Re-render drops them; can trigger page observers/analytics | `Map<id, WeakRef<Element>>` in the content script |
| `element.value = x` for filling inputs | Ignored by React/Angular controlled inputs | Native setter + `input`/`change` events |
| `display:none` / `hidden` live region | Not announced | Visually-hidden clip pattern |
| Playing earcons through the page's `AudioContext` | Autoplay policy blocks it without page user activation | Oscillator in the offscreen document |
| Streaming/SSE responses, agent loops, LangChain/Vercel AI SDK, vector stores | Latency and complexity for zero demo value | One request per user turn, single JSON action |
| Prompt/JSON-schema logic inside the proxy | Proxy restarts and redeploys on every prompt tweak | Keep prompt + schema in the extension, proxy stays a thin allowlisted pass-through |
| Any UI framework (React, Svelte, Tailwind) for options/popup | Dependency + bundler; accessibility risk | Semantic HTML (`<button>`, `<label>`, `<fieldset>`, one `role="status"`) |
| `~anthropic/claude-*-latest` aliases | Silent model change before demo | Pin `anthropic/claude-sonnet-5.5` |

## Stack Patterns by Variant

**If the mic permission flow fails on a teammate's machine (Chrome blocks the site-level mic, or the extension ID changed):**
- Check `chrome://settings/content/microphone`, make sure the manifest has a fixed `key`, re-run the permission page.
- Because the extension ID is fixed by `key`, the grant survives reloads.

**If the teammate's Whisper module expects a base64 string or WAV:**
- Add a small `encodeWav()` in the offscreen document (PCM16 mono 16 kHz) and/or `blobToBase64()`; leave the rest unchanged.

**If demo internet is weak:**
- Run the proxy on the laptop; add a `MOCK_MODE=1` env to the proxy that returns canned transcripts/actions keyed by utterance; keep a local HTML mock of the InPost tracking page served from `http://localhost` (add to `matches`). All of this lives in the proxy and a static file, no extension changes.

**If Sonnet is too slow in rehearsal (>4 s end-to-end after STT):**
- Shrink the snapshot (viewport + main landmark only), cap `max_tokens` ~250, play the "working" earcon at once, and A/B a faster model behind `callModel()`.

**If a blind-user test happens on another machine:**
- Deploy the same Hono app to Cloudflare Workers (`wrangler deploy`, secret via `wrangler secret put OPENROUTER_API_KEY`), update the proxy URL in extension options, and keep the demo token + credit cap.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@hono/node-server@2.1.3` | `hono@^4` (4.13.12) | peer dependency `hono ^4`; Node >=20 |
| Chrome 148+ | `message_serialization: "structured_clone"` | Older Chrome ignores the key and uses JSON; Blobs become `{}`. Prefer offscreen-side `fetch` to avoid the dependency |
| Chrome 109+ | `chrome.offscreen` | Needed for the recording design; any current stable Chrome satisfies it |
| `@crxjs/vite-plugin@3.0.0` | `vite ^3 ... ^8` | Only relevant if a bundler is adopted later |
| `wxt@0.21.4` | `vite ^6.3.4 \|\| ^7 \|\| ^8.0.0-0`, `typescript >=5.4` | Only relevant if a bundler is adopted later |
| `vite@8.3.2` | Node `^20.19.0 \|\| >=22.12.0` | Only relevant if a bundler is adopted later |
| OpenRouter `audio/transcriptions` | formats `wav, mp3, flac, m4a, ogg, webm, aac` | multipart cap 25 MB; `language` ISO-639-1 |
| Anthropic strict JSON schema | requires `additionalProperties:false` on every object | no min/max length/number constraints, no recursion |

## Sources

- Chrome Offscreen API reference, https://developer.chrome.com/docs/extensions/reference/api/offscreen (reasons enum, `USER_MEDIA`, `AUDIO_PLAYBACK` 30 s lifetime, only `runtime` API, one doc per profile): HIGH
- Chrome blog "Offscreen Documents in Manifest V3", https://developer.chrome.com/blog/Offscreen-Documents-in-Manifest-v3 (creation, messaging): HIGH
- Chrome docs "Audio recording and screen capture", https://developer.chrome.com/docs/extensions/how-to/web-platform/screen-capture (offscreen + MediaRecorder pattern; does not address mic permission): HIGH for pattern
- Mic permission must be obtained from a visible extension context before offscreen `getUserMedia` (web search synthesis of chrome-extensions-samples issue #821 and community write-ups, https://github.com/GoogleChrome/chrome-extensions-samples/issues/821 , https://extension.js.org/docs/implementation-guide/offscreen-documents): MEDIUM (official docs are silent; **must be verified in a smoke test**)
- Chrome blog "Unlock structured clone for Chrome extension messaging", https://developer.chrome.com/blog/structured-clone-messaging (Chrome 148+, `message_serialization`): HIGH
- Chrome Commands API, https://developer.chrome.com/docs/extensions/reference/api/commands (no keyup, 4 suggested keys, Ctrl/Alt rule): HIGH
- Chrome TTS API, https://developer.chrome.com/docs/extensions/reference/api/tts (`tts` permission, `lang`, `stop`, `onEvent`): HIGH
- OpenRouter announcement and STT docs, https://openrouter.ai/blog/announcements/announcing-audio-apis , https://openrouter.ai/blog/tutorials/transcription-on-openrouter/ , https://openrouter.ai/docs/guides/overview/multimodal/stt (endpoint, formats incl. webm, `language`, response shape, models): HIGH (docs), MEDIUM (provider-specific webm behaviour)
- OpenRouter structured outputs and tool calling guides, https://openrouter.ai/docs/guides/features/structured-outputs , https://openrouter.ai/docs/guides/features/tool-calling (`json_schema`, `strict`, `require_parameters`, `tool_choice`, `parallel_tool_calls`): HIGH
- OpenRouter live model catalogue, `GET https://openrouter.ai/api/v1/models` queried 2026-10-03 (`anthropic/claude-sonnet-5.5`, 1M ctx, $2/$10 per M, supported params; `google/gemini-3.8-flash`; no Haiku in catalogue): HIGH (point-in-time)
- Anthropic structured outputs, https://platform.claude.com/docs/en/build-with-claude/structured-outputs (GA, supported models, schema limits, 24 h grammar cache): HIGH
- Hono docs via Context7 `/websites/hono_dev` (node-server `serve`, `cors`, `c.req.json()`, `c.req.parseBody()`): HIGH
- npm registry (`npm view`, 2026-10-03): hono 4.13.12, @hono/node-server 2.1.3, express 5.2.1, vite 8.3.2, @crxjs/vite-plugin 3.0.0, wxt 0.21.4, esbuild 0.28.2, zod 4.6.5, openai 7.27.0, @openrouter/sdk 1.4.21, @types/chrome 0.3.4, dom-accessibility-api 0.7.1, wrangler 4.147.0: HIGH
- Direct fetch of `https://inpost.pl/sledzenie-przesylek?number=...` on 2026-10-03 (Drupal, `<form class="tracking-form">`, input `minlength=8 maxlength=24`, Didomi consent scripts): MEDIUM (static HTML only; result panel not observed)
- Live-region timing, visually-hidden pattern, native-setter trick, SW idle termination: established web-platform practice from training knowledge, not re-verified this session: MEDIUM (verify with NVDA / on InPost in phase 1)

---
*Stack research for: Chrome MV3 voice agent for blind users on Polish websites*
*Researched: 2026-10-03*
