# Phase 1: User Setup Required

**Generated:** 2026-10-03
**Phase:** 01-voice-to-effect-vertical-slice
**Status:** Incomplete

The offline proxy tests pass. Live checks need access to the OpenRouter account and a microphone.

## Environment Variables

| Status | Variable | Source | Destination |
|--------|----------|--------|-------------|
| [ ] | OPENROUTER_API_KEY | OpenRouter dashboard → Keys → Create key | Untracked server/.env or process environment |

## Dashboard Configuration

- [ ] Create an OpenRouter key with a credit limit. Keep its value out of source files, logs, extension settings and chat transcripts.

## Live Verification

Once the key is configured, the agent starts the proxy with `uv run --directory server uvicorn app.main:create_app --factory --port 8787 --no-access-log` and performs the live `/api/action` check with `kliknij Znajdź` and `button e4 "Znajdź"`. Expected: a schema-valid click on e4, approximately six seconds or less. Record latency and whether upstream usage reports reasoning tokens, without logging request or response text.

The Whisper teammate supplies `server/app/stt_whisper.py` with `transcribe_whisper(audio_bytes, mime) -> str`, following `01-STT-BRIEF.md`. With STT_MODE=whisper, record a three-second Polish phrase using audio/webm;codecs=opus. The agent posts the audio and verifies a 200 Polish transcript. If the provider rejects webm, record that finding so plan 01-03 can use its WAV fallback. No live model or microphone check has passed yet.
