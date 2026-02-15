# CLI Reference

CLI integrates with the router and providers for login, status, and dry-run routing.

## Commands

- start

  - `smart-router start --port <number>`
  - Starts the proxy server (default port 3402). Uses `SMART_ROUTER_PORT` if set.

- login

  - `smart-router login <provider> [--label <name>]`
  - Adds an auth account for a provider. If `<provider>` is omitted, prints all available provider IDs.
  - `--label` defaults to `default` (use labels for multiple accounts).

- accounts

  - `smart-router accounts`
  - Lists all auth accounts, showing status (active/cooldown), email (if known), and profile type.
  - Environment-derived API key providers also appear under “API Key (from env)”.

- accounts remove

  - `smart-router accounts remove <id>`
  - Removes a saved account. Use the `id` from the accounts list output.

- route

  - `smart-router route "<prompt>"`
  - Dry-run routing: classifies prompt, shows tier, score, confidence, selected provider/model, top dimensions, and fallback chain. No provider call is made.

- models (alias: providers)

  - `smart-router models`
  - Displays available providers and those not yet configured (per saved accounts + environment variables).

- stats

  - `smart-router stats`
  - Shows usage totals: requests, tokens, average latency, success rate, and per-provider breakdown.

- help
  - `smart-router help` (also `-h`, `--help`)
  - Prints the built-in usage summary with command list and provider categories.

### Provider IDs

These are recognized provider IDs (as printed by `smart-router login` without arguments):

- OAuth / Device Code
  - `antigravity`, `openai-codex`, `github-copilot`, `qwen-portal`, `minimax-portal`, `minimax-portal-cn`, `copilot-proxy`
- API Key
  - `openai`, `google`, `qwen-dashscope`, `anthropic`, `deepseek`, `xai`, `groq`, `openrouter`

## Use Without pnpm

- Global link (recommended during development):

```bash
pnpm install
pnpm build
pnpm link --global

# Now you can run:
smart-router start
smart-router route "Write code to reverse a string"
```

- Global install from the local repo:

```bash
pnpm install
pnpm build
npm i -g .

# Ensure your global npm bin is on PATH:
npm bin -g

# Then:
smart-router start
```

Notes:

- The package defines `"bin": { "smart-router": "./dist/cli.js" }` and includes a shebang, so the binary works cross‑platform when installed or linked globally.
- Node 20+ required.

## Examples

```bash
# Start
node dist/cli.js start --port 3403

# Login Qwen
node dist/cli.js login qwen-portal --label work

# Accounts overview
node dist/cli.js accounts

# Dry-run routing
node dist/cli.js route "Write code to reverse a string"
```

Code: [cli.ts](file:///d:/BAYU/Project/smart-router/src/cli.ts)
