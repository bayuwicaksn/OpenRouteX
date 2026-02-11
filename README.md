# Smart Router BW

Intelligent routing for OpenClaw using 14-dimension prompt analysis and multi-model cost optimization.

## Installation

```bash
cd projects/smart-router-bw
npm install
```

## Features

- **Dynamic Routing:** Automatically selects the best model (SIMPLE, MEDIUM, COMPLEX, REASONING) based on prompt complexity.
- **Cost Efficiency:** Reduces LLM costs by routing simple tasks to cheaper models like DeepSeek or Gemini Flash.
- **High Performance:** Utilizes Google Antigravity Claude 3 Opus for high-complexity tasks.
- **Proxy Support:** Includes a built-in proxy server to integrate with any OpenAI-compatible client.

## Usage

### Starting the Proxy Server
```bash
node proxy-server.js
```
The server runs by default on port `8403`.

### Configuration
- `config/models.json`: Configure your model providers and pricing.
- `config/scoring.json`: Adjust the weight of different prompt dimensions.

## Testing
Run the test suite to verify routing logic and cost savings:
```bash
node test/test-suite.js
```
