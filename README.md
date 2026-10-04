# FastEcho

FastEcho is a general-purpose Chrome extension that helps blind and visually impaired users interact with websites through Polish voice commands. Built for HackYeah 2026, it can describe a page, suggest available actions, click controls, fill ordinary form fields, scroll, and report the observed result through the user's screen reader.

The core browsing workflow works with the active website's DOM and accessible labels. The repository includes local HTML fixtures for repeatable demonstrations and tests. User-facing commands and announcements are in Polish; this documentation is in English.

## Features

- **Keyboard-operated voice input:** press `Alt+Shift+A` to start recording and press it again to submit a command.
- **Page exploration:** ask what is on the page or what actions are available.
- **Validated browser actions:** model proposals are checked against the current page before execution.
- **Result feedback:** compare page state before and after an action and announce the observed change.
- **Accessible output:** announcements use an ARIA live region, with Chrome TTS as a fallback when page messaging is unavailable.
- **Conversation controls:** repeat the last response, adjust response detail, and answer clarification or confirmation questions.
- **Sensitive-field protection:** mask recognized sensitive data in page snapshots and refuse actions on protected fields or CAPTCHA controls.

## Architecture

```mermaid
flowchart TD
    User["User: keyboard and Polish voice commands"]

    subgraph Browser["Chrome extension — Manifest V3"]
        Worker["Background service worker\nTurn management and orchestration"]
        Offscreen["Offscreen document\nMicrophone capture: WebM or WAV"]
        Content["Content script\nDOM snapshots, masking, validation, execution"]
        Feedback["ARIA live region\nScreen reader announcements"]
        TTS["Chrome TTS fallback"]
    end

    Page["Active website\nDOM and accessible controls"]

    subgraph Backend["Local FastAPI proxy — localhost:8787"]
        Transcribe["POST /api/transcribe\nFFmpeg and Silero VAD, or STT stub"]
        Reasoning["POST /api/action\nPOST /api/explore\nPOST /api/effect"]
    end

    subgraph Cloud["OpenRouter"]
        STT["Speech-to-text model"]
        Chat["Chat model\nStructured JSON responses"]
    end

    User -->|"Alt+Shift+A"| Worker
    Worker -->|"Start / stop recording"| Offscreen
    Offscreen -->|"Audio upload"| Transcribe
    Transcribe <-->|"Real transcription mode"| STT
    Transcribe -->|"Transcript via offscreen document"| Worker
    Worker <-->|"Snapshot, action, observed diff"| Content
    Content <-->|"Read DOM / execute validated action"| Page
    Worker <-->|"Masked text and bounded page context"| Reasoning
    Reasoning <-->|"Server-side API key"| Chat
    Worker -->|"Announcement"| Feedback
    Content -->|"Pre-action announcement"| Feedback
    Feedback --> User
    Worker --> TTS
    TTS --> User
```

The model proposes an action; the extension controls whether it can execute. It validates the target, detects stale page state, asks for clarification when necessary, and requests confirmation for recognized irreversible actions or consent controls. After execution, it observes DOM changes and produces an outcome announcement.

**`live_stt/` is a separate, optional WebSocket transcription service.** It supports OpenRouter and local NeMo Parakeet backends. The Chrome extension currently uses `/api/transcribe` on the main backend and does not connect to this WebSocket service.

## Repository layout

```text
extension/
  src/background/       Service worker, API client, and command pipeline
  src/content/          Page snapshots, action execution, and ARIA feedback
  src/offscreen/        Microphone recording and transcription upload
  src/options/          Microphone permission and shortcut settings
  src/shared/           Protocols, masking, validation, and Polish commands
  static/               Manifest and HTML templates
  e2e/                  Chromium integration tests and live website checks
server/
  app/                  FastAPI proxy, model requests, and audio processing
  fixtures/             Local demo pages
  tests/                Backend tests and a fake OpenRouter server
  .env.example          Backend configuration template
live_stt/               Independent WebSocket ASR service and Docker setup
tests/                  Test plans and reports
CLAUDE.md               Project goals and team guidelines
```

## Requirements

For the extension and main backend:

- Chrome **116 or newer**, with support for loading unpacked extensions.
- Node.js **22.18 or newer** and npm. Tests execute TypeScript directly using Node's built-in type stripping.
- Python **3.12 or newer** and `uv`.
- **FFmpeg** on `PATH` for real audio transcription.
- An **OpenRouter API key** with access to the configured chat and transcription models for the full voice workflow.
- A microphone and a screen reader with ARIA live-region support, such as NVDA or VoiceOver, for spoken feedback on supported pages.

The main backend runs Silero VAD locally on CPU; it does not require a GPU. Docker is only needed if you choose the optional containerized `live_stt` service.

## Quick start

The commands below assume a POSIX shell and start from the repository root. On Windows, use `Copy-Item` in PowerShell instead of `cp`.

### 1. Configure and start the backend

```sh
cd server
uv sync --locked
cp .env.example .env
```

If `.env` already exists, edit it rather than replacing it. Set these values in `server/.env`:

```dotenv
OPENROUTER_API_KEY=your-openrouter-api-key
CHAT_MODEL=anthropic/claude-sonnet-5.5
STT_MODE=whisper
STT_MODEL=openai/whisper-large-v3-turbo
```

The model identifiers above are the defaults configured in this repository. Override them with compatible models available to your OpenRouter account if needed.

Start the server from `server/`:

```sh
uv run --locked uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8787 --no-access-log
```

In another terminal, check readiness:

```sh
curl http://localhost:8787/health
```

Expected response: `{"ok":true}`. This checks the local HTTP service; it does not verify your API key, account balance, or model access. The backend loads `server/.env` automatically and does not expose Swagger or OpenAPI routes.

### 2. Build the extension

In a new terminal, from the repository root:

```sh
cd extension
npm ci
npm run build
```

The build generates `extension/dist/` and uses `http://localhost:8787` as the proxy URL by default.

### 3. Load it in Chrome

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select `extension/dist/`.
3. The extension's options page opens on first installation. Choose **Włącz mikrofon** (Enable microphone) and allow microphone access.
4. Check the assigned shortcut at `chrome://extensions/shortcuts`; the default is `Alt+Shift+A`.
5. Enable your screen reader, open an ordinary HTTP(S) website, and issue a voice command. You can also use the local demo below.

After changing extension code or build settings, rebuild and reload the extension in `chrome://extensions`. Reload the website too so it receives the updated content script.

### 4. Try a local demo page

Open:

```text
http://localhost:8787/fixtures/tracking-form.html
```

Press `Alt+Shift+A`, say a command in Polish, and press the shortcut again to submit it. Recording automatically ends after **25 seconds**.

| Polish command | Purpose |
| --- | --- |
| `Co tu jest?` | Summarize the current page. |
| `Co mogę zrobić?` | List available actions. |
| `Sprawdź status przesyłki` | Start the parcel-tracking conversation. |
| `Kliknij Znajdź` | Request a click on a named control. |
| `Przewiń w dół` / `Przewiń w górę` | Scroll the page. |
| `Na górę strony` | Return to the top. |
| `Powtórz` | Repeat the last delivered response for the current page. |
| `Krócej` / `Dokładniej` | Adjust response detail. |
| `Tak` / `Nie` | Confirm or decline a pending action. |

For a fixture-only parcel demo, start tracking, provide `12345678` when asked for the parcel number, and confirm the read-back with `Tak`. The fixture simulates a tracking result locally.

### Transcription stub mode

For a microphone and pipeline check without a paid transcription call, use:

```dotenv
STT_MODE=stub
STT_STUB_TEXT=kliknij Znajdź
```

Restart the backend after changing settings. Stub mode returns the configured text regardless of the recording. **It replaces speech recognition only:** commands that use chat-model endpoints still require an OpenRouter key. The automated E2E suite supplies a fake upstream for tests without paid API calls.

## Configuration

### Main backend: `server/.env`

| Variable | Default / behavior |
| --- | --- |
| `OPENROUTER_API_KEY` | Required for model-backed actions, exploration, effects, and real transcription. |
| `CHAT_MODEL` | `anthropic/claude-sonnet-5.5`; use a fixed compatible model identifier. |
| `OPENROUTER_BASE_URL` | `https://openrouter.ai/api/v1`. |
| `OPENROUTER_TIMEOUT_S` | `15` seconds for chat requests. |
| `STT_MODE` | `stub`; set `whisper` for real transcription through OpenRouter. |
| `STT_MODEL` | `openai/whisper-large-v3-turbo`; selects the real transcription model. |
| `STT_STUB_TEXT` | `kliknij Znajdź`. |
| `STT_AUDIO_DEBUG_DIR` | Disabled when empty; optionally saves outgoing processed WAV audio locally. |
| `MAX_BODY_BYTES` | `2097152` (2 MiB). |
| `EXTENSION_ID` | Derived from the key in `extension/static/manifest.json` unless explicitly set. |
| `ALLOWED_HOSTS` | Additional comma-separated hosts; `localhost` and `127.0.0.1` are always included. |
| `WARMUP_ON_START` | Disabled; `1` or `true` enables startup warm-up requests when a key is configured. |

Real transcription decodes audio with FFmpeg, detects speech with Silero VAD, and sends processed mono 16 kHz WAV audio to OpenRouter. Despite the name `STT_MODE=whisper`, `STT_MODEL` may select another compatible transcription model.

### Extension build settings

These values are embedded during the build:

```sh
cd extension
PROXY_URL=http://localhost:8787 AUDIO_FORMAT=wav npm run build
```

- `PROXY_URL`: backend URL; also determines proxy host permissions and fixture matching in the generated manifest.
- `AUDIO_FORMAT`: `webm` (default, Opus) or `wav` (PCM16, mono, 16 kHz).

For PowerShell, set `$env:PROXY_URL` and `$env:AUDIO_FORMAT` before running `npm run build`.

## Backend API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Local service health check. |
| `POST` | `/api/transcribe` | Accept an audio body with an `audio/*` content type and return `{"text":"..."}`. |
| `POST` | `/api/action` | Propose a structured action from an utterance and page snapshot. |
| `POST` | `/api/explore` | Generate a page summary or select available action candidates. |
| `POST` | `/api/effect` | Summarize an executed action and observed page diff. |
| `GET` | `/fixtures/<filename>.html` | Serve local demo and test pages. |

Request and response contracts are defined in [server/app/schemas.py](server/app/schemas.py), [server/app/exploration.py](server/app/exploration.py), and [extension/src/shared/protocol.ts](extension/src/shared/protocol.ts). Browser-origin requests are restricted to the configured extension origin.

## Privacy and action safety

- API keys stay in the backend environment, outside the extension bundle.
- Page context uses bounded DOM-derived snapshots rather than screenshots or full HTML.
- Recognized sensitive fields and supported identifier patterns are masked before text context is sent to model endpoints. An additional egress check blocks text payloads that still contain recognized sensitive patterns.
- The executor refuses protected password, payment-code, and other sensitive fields, as well as recognized CAPTCHA targets.
- Confirmation and target validation happen locally, including a fresh check immediately before a side effect.
- Backend access logs record paths, statuses, and timings rather than request bodies or transcripts. Audio debug copies are opt-in.

**Audio is a separate data path:** in real transcription mode, recorded speech is sent to OpenRouter before transcript masking. Avoid dictating passwords or other secrets. Local masking is a defensive heuristic, not a guarantee that every sensitive value or dangerous control can be recognized on every website.

## Development and tests

Run extension checks from `extension/`:

```sh
npm run typecheck
npm test
npm run build
```

Run backend tests from `server/`:

```sh
uv run --locked pytest -q
```

For browser integration tests, install Chromium and ensure `uv` and Node.js are on `PATH`. From `extension/`:

```sh
npm run dom-check
npm run e2e
```

The E2E runner builds into `dist-e2e/`, launches an isolated browser with a fake microphone, and starts a test proxy and fake OpenRouter on ports **8788** and **8799**. It does not require a real API key. Set `CHROMIUM_BIN` to the browser executable if it is not named `chromium`; use `HEADFUL=1` to show the test browser.

See [the test report](tests/REPORT.md) for test scope and recorded results.

## Optional WebSocket ASR service

`live_stt/` can serve other audio clients independently of the Chrome extension. Its API uses Python **3.14.7**; the local NeMo worker uses a separate Python **3.13.15** environment. The launcher requires `uv >= 0.12.19` and Docker with Linux containers.

```sh
cd live_stt
cp env.example config.env
# Edit config.env: choose ASR_BACKEND and configure the selected backend.
uv run --locked --no-dev run.py start
uv run --locked --no-dev run.py logs
```

Connect a compatible PCM16, 16 kHz, mono audio client to `ws://127.0.0.1:7000/v1/transcribe`. Choose `ASR_BACKEND=openrouter` with an API key, or `ASR_BACKEND=local` with NeMo Parakeet and `DEVICE=cpu` or `cuda`. CUDA requires an NVIDIA GPU exposed to Docker.

Stop the service with `uv run --locked --no-dev run.py stop`. The default Compose configuration publishes port 7000 on all interfaces and has no client authentication; bind it to loopback for a local-only setup.

Detailed configuration, protocol, and runtime requirements are documented in [live_stt/README.md](live_stt/README.md).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Shortcut does nothing | Check `chrome://extensions/shortcuts` for conflicts or an unassigned command. |
| Microphone cannot start | Open extension options, grant microphone access, and check OS microphone permissions. |
| No spoken response on the page | Enable your screen reader and its live-region announcements. Chrome TTS is used when page messaging fails. |
| Every recording produces the same command | Set `STT_MODE=whisper` instead of `stub` and restart the backend. |
| Backend reports `no_api_key` | Set `OPENROUTER_API_KEY` in `server/.env` and restart. |
| Real transcription fails | Check FFmpeg on `PATH`, API credentials, model access, and backend logs. |
| Extension cannot reach the backend | Check `/health` and the build-time `PROXY_URL`; rebuild and reload after changing it. |
| Requests are rejected with `forbidden_origin` | Check that the loaded extension's ID matches the backend configuration and manifest key. |
| A page is unsupported | Browser-internal pages and extension stores cannot be automated. Use an ordinary HTTP(S) page. |
| Chromium tests cannot launch | Set `CHROMIUM_BIN` to a compatible executable and ensure ports 8788 and 8799 are free. |

## Scope and limitations

FastEcho is a general-purpose browsing assistant with Polish voice interaction. On ordinary HTTP(S) websites, pressing the shortcut grants access to the active tab and injects the content script when needed.

This hackathon prototype executes actions in the top-level document. Compatibility depends on each site's DOM and accessible labels, so behavior may vary between websites.

The main extension uploads a completed recording rather than streaming audio. Cloud-backed features require network access and may incur provider charges. Dynamic page changes, third-party widgets, and model errors can interrupt a command; announcements report observed page changes rather than independently verifying a transaction with the external service.

For further implementation details, see [the backend audio documentation](server/README.md) and [the project guidelines](CLAUDE.md).
