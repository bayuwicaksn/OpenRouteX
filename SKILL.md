# Smart Router Skill

This skill provides intelligent routing capabilities for OpenClaw, optimizing model selection based on prompt complexity, cost, and task type.

## Features

- **Automatic Model Selection:** Analyzes prompts across 14 dimensions (Code, Math, Reasoning, etc.) to select the most appropriate model tier (SIMPLE, MEDIUM, COMPLEX, REASONING).
- **Cost Optimization:** Routes simpler tasks to cheaper/free models while reserving expensive reasoning models for complex tasks.
- **Google Antigravity Integration:** Prioritizes Google Antigravity Opus/Gemini models for high-complexity reasoning and coding.
- **Usage Analytics:** Tracks token usage and estimated costs.
- **Fallback Handling:** Gracefully degrades to backup models if the primary provider fails.

## Configuration

Configuration files are located in `config/`:
- `models.json`: Defines model tiers, providers, and costs.
- `scoring.json`: Defines weighting and regex patterns for complexity analysis.

## Usage

### Direct Routing (Internal)
```javascript
const { route } = require('./router');
const decision = route("Write a complex Python script...");
console.log(decision.tier); // "COMPLEX"
console.log(decision.model.id); // "google-antigravity/claude-opus-4-6-thinking"
```

### Proxy Server
The skill includes a proxy server (`proxy-server.js`) that can intercept and route requests.
```bash
node proxy-server.js
```

## Dependencies
- express
- axios
- google-auth-library
- body-parser
