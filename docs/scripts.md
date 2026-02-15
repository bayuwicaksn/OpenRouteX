# Scripts

Helper scripts for listing models, testing, and cooldown management.

## Model Listing (Legacy JS)

- Script: [scripts/list-models.js](file:///d:/BAYU/Project/smart-router/scripts/list-models.js)
- Default proxy:
  - `proxyUrl: 'http://localhost:3402'`
- Change port:
  - Update the `proxyUrl` or start proxy on 3402

## Model Listing (TypeScript)

- Script: [scripts/model-list.ts](file:///d:/BAYU/Project/smart-router/scripts/model-list.ts)
- Commands:

```bash
pnpm run models:list
pnpm run models:list:compact -- --port 3403
pnpm run models:list:json -- --port 3403
pnpm run models:list:antigravity -- --port 3403
```

## Test Model CLI

- Script: [scripts/test-model-cli.js](file:///d:/BAYU/Project/smart-router/scripts/test-model-cli.js)
- Non-stream:

```bash
pnpm run test:model -- --model google/gemini-3-flash --prompt "Say hi" --port 3403
```

- Stream:

```bash
pnpm run test:model:stream -- --model sonnet --prompt "Stream a short poem" --port 3403
```

## Reset Cooldowns

- Script: [scripts/reset-cooldowns.ts](file:///d:/BAYU/Project/smart-router/scripts/reset-cooldowns.ts)
- Use when profiles are stuck in cooldown:

```bash
pnpm tsx scripts/reset-cooldowns.ts
```
