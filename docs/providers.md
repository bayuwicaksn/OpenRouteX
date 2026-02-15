# Providers

Supported providers and how to enable them.

## OAuth / Device Code

- Google Antigravity (`antigravity`)
  - Login: `node dist/cli.js login antigravity`
  - Provider implementation: [antigravity.ts](file:///d:/BAYU/Project/smart-router/src/providers/antigravity.ts)

- Qwen Portal (`qwen-portal`)
  - Login: `node dist/cli.js login qwen-portal`
  - Provider: [qwen-portal.ts](file:///d:/BAYU/Project/smart-router/src/providers/qwen-portal.ts)

- MiniMax Portal (`minimax-portal`, `minimax-portal-cn`)
  - Login: `node dist/cli.js login minimax-portal` / `minimax-portal-cn`
  - Provider: [minimax-portal.ts](file:///d:/BAYU/Project/smart-router/src/providers/minimax-portal.ts)

- OpenAI Codex (`openai-codex`)
  - Login: `node dist/cli.js login openai-codex`
  - Provider: [openai-codex.ts](file:///d:/BAYU/Project/smart-router/src/providers/openai-codex.ts)

## API Key

Set environment variables and restart the proxy:

- OpenAI: `OPENAI_API_KEY`
- Google Gemini: `GEMINI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`
- DeepSeek: `DEEPSEEK_API_KEY`
- xAI: `XAI_API_KEY`
- Groq: `GROQ_API_KEY`
- OpenRouter: `OPENROUTER_API_KEY`

Registry:
- [providers/index.ts](file:///d:/BAYU/Project/smart-router/src/providers/index.ts)
- Base utilities: [providers/base.ts](file:///d:/BAYU/Project/smart-router/src/providers/base.ts)
