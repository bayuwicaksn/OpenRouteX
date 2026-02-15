# Configuration

Configure ports, auth storage, raw logging, and provider credentials.

## Ports

- Default proxy port: 3402
- Override:
  - `pnpm run proxy:start -- --port 3403`
  - Environment: `SMART_ROUTER_PORT=3403`

## Raw Logging

- Windows-friendly scripts:
  - `pnpm run proxy:start:raw` (3402)
  - `pnpm run proxy:start:raw:3403`
- Custom:
  - PowerShell: `$env:DEBUG_RAW='1'`
  - Git Bash: `DEBUG_RAW=1`

## Auth Store

- Default path: `src/data/auth-store.json` (resolved at runtime)
- Override: `SMART_ROUTER_AUTH_STORE=/path/to/auth-store.json`
- Code: [auth-store.ts](file:///d:/BAYU/Project/smart-router/src/auth-store.ts#L17-L21)

## Provider Availability

- From profiles: `getAvailableProviders()` reads saved OAuth/device credentials
- From environment variables (API keys):
  - OPENAI_API_KEY → `openai`
  - GEMINI_API_KEY → `google`
  - DASHSCOPE_API_KEY → `qwen-dashscope`
  - ANTHROPIC_API_KEY → `anthropic`
  - DEEPSEEK_API_KEY → `deepseek`
  - XAI_API_KEY → `xai`
  - GROQ_API_KEY → `groq`
  - OPENROUTER_API_KEY → `openrouter`
- Code: [auth-store.ts](file:///d:/BAYU/Project/smart-router/src/auth-store.ts#L128-L156)

## CLI Integration

- Start: `smart-router start --port <number>`
- Login: `smart-router login <provider> [--label <name>]`
- Accounts: `smart-router accounts` / `accounts remove <id>`
- Route dry-run: `smart-router route "<prompt>"`
- Providers status: `smart-router models`
- Code: [cli.ts](file:///d:/BAYU/Project/smart-router/src/cli.ts)
