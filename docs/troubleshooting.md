# Troubleshooting

Common issues and solutions when using the Smart Router.

## `DEBUG_RAW` Not Recognized (Windows)

- Use PowerShell wrapper scripts:
  - `pnpm run proxy:start:raw`
  - `pnpm run proxy:start:raw:3403`
- Or set in PowerShell:
  - `$env:DEBUG_RAW='1'`

## Port Busy (`EADDRINUSE`)

- Start the proxy on a different port:
  - `pnpm run proxy:start -- --port 3403`

## Explicit Model 404

- If a specific `model` is requested and not found:
  - The proxy returns `404` and does not fallback
  - Use `auto` or a valid id
- Code: [proxy.ts](file:///d:/BAYU/Project/smart-router/src/proxy.ts#L690-L717)

## No Providers Configured

- Log in with OAuth/device providers:
  - `node dist/cli.js login antigravity`
- Or set API keys before starting:
  - `OPENAI_API_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, etc.

## Rate Limits & Cooldowns

- Failures may set cooldowns:
  - Model-specific cooldown for `rate_limit` and `model_not_found`
  - Global cooldown disables profile temporarily
- Inspect and reset cooldowns:
  - Script: [scripts/reset-cooldowns.ts](file:///d:/BAYU/Project/smart-router/scripts/reset-cooldowns.ts)
  - Auth store: [auth-store.ts](file:///d:/BAYU/Project/smart-router/src/auth-store.ts#L263-L317)

## Health Check

```bash
pnpm run proxy:health
```
