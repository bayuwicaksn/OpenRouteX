# Testing

How to test models (auto or explicit), streaming behavior, and inspect proxy responses.

## Start Proxy (Raw Logs)

```bash
pnpm run proxy:start:raw:3403
```

## Test Script (Non-stream)

```bash
pnpm run test:model -- \
  --model antigravity/gemini-3-flash \
  --prompt "Say hi" \
  --port 3403
```

## Test Script (Stream)

```bash
pnpm run test:model:stream -- \
  --model sonnet \
  --prompt "Stream a concise summary of Kafka’s Metamorphosis" \
  --port 3403
```

Script: [test-model-cli.js](file:///d:/BAYU/Project/smart-router/scripts/test-model-cli.js)

## Curl (Non-stream)

```bash
curl -v http://localhost:3403/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"antigravity/gemini-3-flash","messages":[{"role":"user","content":"Say hi"}]}'
```

## Curl (Stream)

```bash
curl -sN http://localhost:3403/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{"model":"antigravity/gemini-3-flash","messages":[{"role":"user","content":"Stream please"}],"stream":true}'
```

## Inspect Routing

```bash
node dist/cli.js route "Design a unit test for a parser with tricky edge cases"
```

## Headers to Check

- `X-Smart-Router-Provider`
- `X-Smart-Router-Tier`
- `X-Smart-Router-Reason`

## Windows PowerShell Usage

- Single line (recommended):

```powershell
pnpm run test:model -- --model antigravity/gemini-3-flash --prompt "Say hi" --port 3403
```

- Multi-line in PowerShell: use backtick (`) for line continuation, not backslash:

```powershell
pnpm run test:model -- `
  --model antigravity/gemini-3-flash `
  --prompt "Say hi" `
  --port 3403
```

- Do not paste flags alone on a new line (e.g., `--model ...` by itself); PowerShell treats `--` as a unary operator and will error with “Missing expression after unary operator '--'”.

## Force A Specific Account

- Curl:

```bash
curl -s -D - http://localhost:3403/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Smart-Router-Profile: antigravity:work" \
  -d '{"model":"antigravity/gemini-3-flash","messages":[{"role":"user","content":"Use this account"}]}'
```

- Script:

```bash
pnpm run test:model -- --model antigravity/gemini-3-flash --prompt "Say hi" --profile antigravity:work --port 3403
```

- Notes:
  - The profile must exist (see `smart-router accounts`) and belong to the target provider.
  - If the profile belongs to a different provider, the proxy returns 400 `profile_provider_mismatch`.
