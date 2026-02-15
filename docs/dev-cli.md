# Dev CLI

Run the CLI directly in development without building or global install.

## Prerequisites

- Node.js 20+
- pnpm installed

## Quick Commands

- Run CLI in dev (interactive entry):

  - `pnpm dev`
  - Opens the CLI entry. Use arguments like `start`, `login`, etc., after `src/cli.ts` when running directly with tsx (examples below).

- Start proxy in dev:

  - `pnpm start`
  - Equivalent to `pnpm exec tsx src/cli.ts start` with on-the-fly TypeScript execution.

- Dry-run routing:

```bash
tsx src/cli.ts route "Write code to reverse a string"
```

- Login (OAuth/device code):

```bash
tsx src/cli.ts login antigravity
tsx src/cli.ts login qwen-portal
tsx src/cli.ts login minimax-portal
tsx src/cli.ts login minimax-portal-cn
tsx src/cli.ts login openai-codex
```

- Accounts:

```bash
tsx src/cli.ts accounts
tsx src/cli.ts accounts remove <profileId>
```

- Models/providers:

```bash
tsx src/cli.ts models
tsx src/cli.ts providers
```

- Stats:

```bash
tsx src/cli.ts stats
```

## Raw Logs in Dev

- Windows PowerShell:

```bash
$env:DEBUG_RAW='1'
tsx src/cli.ts start --port 3403
```

- Git Bash:

```bash
DEBUG_RAW=1 tsx src/cli.ts start --port 3403
```

Raw logs include safe headers, request body, stream chunks, and non-stream previews, plus routing metadata.

## Port Busy (EADDRINUSE)

If you see `Error: listen EADDRINUSE: address already in use :::3402`, another process is already using the default port.

- Start on a different port:

```bash
pnpm start --port 3403
# or
pnpm exec tsx src/cli.ts start --port 3403
```

- Set environment variable:

```bash
# PowerShell
$env:SMART_ROUTER_PORT='3403'
pnpm start

# Git Bash
SMART_ROUTER_PORT=3403 pnpm start
```

- Find and kill the process using the port (PowerShell):

```powershell
netstat -ano | findstr :3402
# Note the PID in the last column
taskkill /PID <pid> /F
```

- Alternative (PowerShell with Get-NetTCPConnection):

```powershell
Get-NetTCPConnection -LocalPort 3402 -State Listen |
  Select-Object -First 1 |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

## If `tsx` Is Not Recognized

- Use pnpm exec (preferred):

```bash
pnpm exec tsx src/cli.ts start
pnpm exec tsx src/cli.ts route "Write code to reverse a string"
```

- Or use npx:

```bash
npx tsx src/cli.ts start
npx tsx src/cli.ts route "Write code to reverse a string"
```

- Or install tsx globally:

```bash
npm i -g tsx
tsx src/cli.ts start
```

- Or build and run the compiled binary:

```bash
pnpm build
node dist/cli.js start
```

## Sandbox (Antigravity) — Isolated Folder

- Start isolated proxy (port 3410):

```bash
pnpm exec tsx sandbox/antigravity/start.ts
```

- Login in sandbox store:

```bash
pnpm exec tsx sandbox/antigravity/login.ts
```

- Direct upstream call (bypasses proxy) for debugging:

```bash
# Uses sandbox store by default
pnpm exec tsx sandbox/antigravity/direct-call.ts --model gemini-3-pro --prompt "Hello"

# Use a specific profile from the store
pnpm exec tsx sandbox/antigravity/direct-call.ts --model gemini-3-pro --prompt "Hello" --profile antigravity:work
```

- Use the main project store instead of sandbox:

```bash
# PowerShell
$env:SMART_ROUTER_AUTH_STORE="D:\BAYU\Project\smart-router\data\auth-store.json"
pnpm exec tsx sandbox/antigravity/direct-call.ts --model gemini-3-pro --prompt "Hello" --profile antigravity:default
```

Notes:
- The sandbox stores credentials under `sandbox/antigravity/auth-store.json` by default.
- The direct-call script uses Antigravity’s SSE endpoint and prints tokens while streaming.

## Vertex GenerateContent (Test with OAuth or raw token)

- Call Vertex directly using Antigravity OAuth (may require proper token type):

```bash
pnpm exec tsx sandbox/antigravity/vertex-call.ts --model gemini-3-pro --prompt "Hello world" --location us-central1
```

- Override bearer token (e.g., from external profile JSON):

```bash
# PowerShell
$env:VERTEX_TOKEN="<paste_access_token_here>"
$env:GOOGLE_CLOUD_PROJECT="perfect-transit-486608-d4"
pnpm exec tsx sandbox/antigravity/vertex-call.ts --model gemini-3-pro --prompt "Hello world" --location us-central1
```

Notes:
- If you see 401 UNAUTHENTICATED with ACCESS_TOKEN_TYPE_UNSUPPORTED, use a service account or proper OAuth token authorized for Vertex.
- You can also pass `--project <id>` explicitly if not set via env.

## Environment Variables

- SMART_ROUTER_PORT: override default port (3402)
- SMART_ROUTER_AUTH_STORE: custom path to auth store JSON
- Provider keys (API key providers):
  - OPENAI_API_KEY, GEMINI_API_KEY, DASHSCOPE_API_KEY, ANTHROPIC_API_KEY,
    DEEPSEEK_API_KEY, XAI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY

Code references:

- CLI: [cli.ts](file:///d:/BAYU/Project/smart-router/src/cli.ts)
- Proxy: [proxy.ts](file:///d:/BAYU/Project/smart-router/src/proxy.ts)
- Router: [index.ts](file:///d:/BAYU/Project/smart-router/src/router/index.ts), [rules.ts](file:///d:/BAYU/Project/smart-router/src/router/rules.ts), [selector.ts](file:///d:/BAYU/Project/smart-router/src/router/selector.ts), [config.ts](file:///d:/BAYU/Project/smart-router/src/router/config.ts)
- Providers: [providers/index.ts](file:///d:/BAYU/Project/smart-router/src/providers/index.ts)
