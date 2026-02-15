# Smart Router Documentation

Welcome to the Smart Router docs. This guides you through installation, configuration, routing behavior, provider setup, testing, troubleshooting, and CLI usage.

## Table of Contents

- [Quick Start](./quick-start.md)
- [Architecture](./architecture.md)
- [Configuration](./configuration.md)
- [Routing](./routing.md)
- [Providers](./providers.md)
- [CLI Reference](./cli.md)
- [Testing](./testing.md)
- [Troubleshooting](./troubleshooting.md)
- [Scripts](./scripts.md)
- [Dev CLI](./dev-cli.md)
- [Accounts (Multi-Account)](./accounts.md)

## Highlights

- Auto model selection across tiers (SIMPLE, MEDIUM, COMPLEX, REASONING)
- OAuth and API key providers with round‑robin profile usage and cooldowns
- OpenAI-compatible endpoints with SSE streaming support
- Raw request/response logging for deep debugging

## Code References

- Router entry: [index.ts](file:///d:/BAYU/Project/smart-router/src/router/index.ts#L20-L26)
- Scoring: [rules.ts](file:///d:/BAYU/Project/smart-router/src/router/rules.ts#L8-L56)
- Tier config: [config.ts](file:///d:/BAYU/Project/smart-router/src/router/config.ts#L74-L143)
- Selection: [selector.ts](file:///d:/BAYU/Project/smart-router/src/router/selector.ts#L7-L82)
- Proxy: [proxy.ts](file:///d:/BAYU/Project/smart-router/src/proxy.ts)
