# Architecture

This page explains internal modules and how requests flow through the Smart Router.

## Modules

- Proxy HTTP server: [proxy.ts](file:///d:/BAYU/Project/smart-router/src/proxy.ts)
  - OpenAI-compatible endpoints:
    - POST `/v1/chat/completions`
    - GET `/v1/models`
    - GET `/health`
  - Streaming support via SSE, converts provider streams to OpenAI chunks
  - Raw logging with `DEBUG_RAW=1`

- Router:
  - Entry: [index.ts](file:///d:/BAYU/Project/smart-router/src/router/index.ts#L20-L26)
  - Scoring: [rules.ts](file:///d:/BAYU/Project/smart-router/src/router/rules.ts#L8-L56)
  - Config (keywords, weights, tiers, tier models, fallback): [config.ts](file:///d:/BAYU/Project/smart-router/src/router/config.ts)
  - Selection & fallbacks: [selector.ts](file:///d:/BAYU/Project/smart-router/src/router/selector.ts)

- Providers:
  - Registry: [providers/index.ts](file:///d:/BAYU/Project/smart-router/src/providers/index.ts)
  - OAuth/device code: antigravity, qwen-portal, minimax-portal, openai-codex
  - API keys: openai, google, qwen-dashscope, anthropic, deepseek, xai, groq, openrouter
  - Base utilities: [providers/base.ts](file:///d:/BAYU/Project/smart-router/src/providers/base.ts)

- Auth Store:
  - Location: [auth-store.ts](file:///d:/BAYU/Project/smart-router/src/auth-store.ts)
  - Stores credentials and usage stats with cooldown logic
  - Exposes helper functions: `pickNextProfile`, `getAvailableProviders`, `markProfileUsed`, `markProfileFailure`

- Stats:
  - Aggregates usage metrics: [stats.ts](file:///d:/BAYU/Project/smart-router/src/stats.ts)

## Request Flow

1. Client sends OpenAI-compatible request to `/v1/chat/completions`.
2. Proxy extracts the prompt and decides:
   - Explicit model (fast path): direct route
   - Auto: route via scoring + selection
3. Profile selection:
   - OAuth/device code providers: round‑robin among active profiles, respecting cooldowns
   - API key providers: read from environment variables
4. Provider call:
   - Build request (transform if needed)
   - Stream SSE or non-stream and convert to OpenAI format
5. Response:
   - Inject routing metadata headers (provider, profile, tier, score)
   - Record stats and audit log

## Streaming Conversion

- Antigravity and Codex Responses API stream SSE:
  - Proxy parses provider events and emits OpenAI `chat.completion.chunk` frames
  - Emits `[DONE]` when completion finishes

Relevant code:
- SSE handler: [proxy.ts](file:///d:/BAYU/Project/smart-router/src/proxy.ts#L465-L531)
- Non-stream parsing and formatting: [proxy.ts](file:///d:/BAYU/Project/smart-router/src/proxy.ts#L586-L626)

## Error Handling

- Explicit unknown model: 404 with no fallback
- Provider failures:
  - Rate limits and model-not-found set model-specific cooldowns
  - Other errors may set global cooldown or disable a profile
  - Fallbacks are attempted in chain (auto mode only)

References:
- Early 404 for explicit model: [proxy.ts](file:///d:/BAYU/Project/smart-router/src/proxy.ts#L690-L717)
- Failure tracking and cooldowns: [auth-store.ts](file:///d:/BAYU/Project/smart-router/src/auth-store.ts#L263-L317)
