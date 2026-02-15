# Routing

Details on scoring dimensions, tiers, model selection, and explicit model behavior.

## Scoring

- 14 dimensions with weighted keywords
- Word-boundary matching to avoid substring false positives
- Confidence computed from top dimensions
- Code: [rules.ts](file:///d:/BAYU/Project/smart-router/src/router/rules.ts#L8-L56)

## Configuration

- Keywords, weights, tier boundaries:
  - [config.ts](file:///d:/BAYU/Project/smart-router/src/router/config.ts#L74-L99)
  - Tier → models: [config.ts](file:///d:/BAYU/Project/smart-router/src/router/config.ts#L102-L133)
  - Fallback order: [config.ts](file:///d:/BAYU/Project/smart-router/src/router/config.ts#L137-L143)

## Selection

- Algorithm:
  - Pick the first available model in the chosen tier
  - Build `fallbackChain` from remaining tier models and `fallbackOrder`
  - Return `none` if no providers are available
- Code: [selector.ts](file:///d:/BAYU/Project/smart-router/src/router/selector.ts#L7-L82)

## Explicit Model Behavior

- If a specific model is requested and not found:
  - Return 404 with `model_not_found`
  - No fallback attempts
- Code: [proxy.ts](file:///d:/BAYU/Project/smart-router/src/proxy.ts#L690-L717)

## Dry Run

```bash
node dist/cli.js route "Think step by step about tradeoffs"
```

Shows tier, score, selected provider/model, top dimensions, and fallback chain.
