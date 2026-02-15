# Quick Start

Follow these steps to get the Smart Router running locally and test auto model routing.

## Prerequisites

- Node.js 20+ runtime
- pnpm installed

## Install

```bash
pnpm install
```

## Start the Proxy (Raw Logs Enabled)

Windows-friendly scripts:

```bash
# Default port 3402
pnpm run proxy:start:raw

# Port 3403 (recommended to avoid conflicts)
pnpm run proxy:start:raw:3403
```

Custom port:

```bash
# PowerShell
$env:DEBUG_RAW='1'; pnpm run proxy:start -- --port 3405

# Git Bash
DEBUG_RAW=1 pnpm run proxy:start -- --port 3405
```

## Log In (OAuth Providers)

```bash
# Google Antigravity
node dist/cli.js login antigravity

# Qwen Portal
node dist/cli.js login qwen-portal

# MiniMax Portal (Global or China)
node dist/cli.js login minimax-portal
node dist/cli.js login minimax-portal-cn
```

## API Key Providers

Set environment variables before starting:

- OPENAI_API_KEY
- GEMINI_API_KEY
- ANTHROPIC_API_KEY
- DEEPSEEK_API_KEY
- XAI_API_KEY
- GROQ_API_KEY
- OPENROUTER_API_KEY

## Test Auto Model (Non-stream)

```bash
pnpm run test:model -- --model auto --prompt "Write a quick utility function" --port 3403
```

## Test Auto Model (Stream)

```bash
pnpm run test:model:stream -- --model auto --prompt "Stream a concise summary of Kafka’s Metamorphosis" --port 3403
```

## Inspect Headers

```bash
curl -s -D - http://localhost:3403/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Write a quick utility function"}]}'
```

Look for:
- `X-Smart-Router-Provider`
- `X-Smart-Router-Tier`
- `X-Smart-Router-Reason`
