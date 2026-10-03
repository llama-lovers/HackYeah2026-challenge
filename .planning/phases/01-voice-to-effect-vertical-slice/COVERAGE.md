# API Coverage — OpenRouter

> Full coverage by default. Opt-outs are explicit, reasoned decisions. Phase 1 integrates OpenRouter through the FastAPI proxy only (plan 01-01); the extension never calls OpenRouter directly.

| capability | decision | reason |
|---|---|---|
| chat completions (non-streaming POST /api/v1/chat/completions) | INTEGRATE | /api/action and /api/effect (plan 01-01) |
| structured outputs (response_format json_schema, strict) | INTEGRATE | D-19; action and effect schemas |
| provider routing require_parameters | INTEGRATE | Prevents routing to endpoints that ignore the schema |
| sampling and length params (temperature, max_tokens) | INTEGRATE | temperature 0; max_tokens 300 (action) and 150 (effect) per D-17 |
| finish_reason handling (length -> truncated) | INTEGRATE | Mapped to model_truncated, never forwarded raw |
| app attribution header (X-OpenRouter-Title) | INTEGRATE | Optional header sent by the proxy |
| audio transcriptions (POST /api/v1/audio/transcriptions) | INTEGRATE | Teammate's Whisper module behind the frozen transcribe(audio_bytes, mime) seam (D-11, 01-STT-BRIEF.md); stub mode until it lands |
| tool calling (tools / tool_choice) | OPT-OUT | not needed yet: D-19 locks strict json_schema; the forced-tool fallback is used only if the live human-check shows schema non-compliance |
| streaming responses (SSE stream=true) for chat | OPT-OUT | explicitly out of scope: replies are short single JSON objects and research rules out streaming |
| streaming transcription | OPT-OUT | explicitly out of scope: OpenRouter has no streaming STT; deferred by the user (01-STT-BRIEF.md section 4) |
| models list (GET /api/v1/models) | OPT-OUT | not needed: the model is pinned in proxy config and the id is re-checked by hand before the demo |
| fallback model list (models: [...]) | OPT-OUT | not needed: D-19 pins one model and a silent fallback could change behavior before the demo |
| reasoning controls (reasoning / reasoning_effort) | OPT-OUT | not needed yet: check usage on the first live call (plan 01-01 Task 3 human-check), then decide |
| prompt caching (cache_control) | OPT-OUT | not needed yet: research says skip until latency is measured |
| image / multimodal input | OPT-OUT | explicitly out of scope: no screenshots (CLAUDE.md privacy, V2-04) |
| text-to-speech / audio output | OPT-OUT | explicitly out of scope: output is the user's screen reader; chrome.tts fallback is Phase 4 |
| embeddings | OPT-OUT | not needed: no retrieval in this product |
| web search / plugins | OPT-OUT | not needed: the agent acts only on the current page |
| credits, generation stats and key management endpoints | OPT-OUT | not needed: the spend cap is set on the key in the OpenRouter dashboard (user_setup), not through the API |
| BYOK / provider preferences beyond require_parameters | OPT-OUT | not needed: default routing with require_parameters is enough for the hackathon |
