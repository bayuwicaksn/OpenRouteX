/**
 * parseArgs
 * Parses CLI flags from process.argv into a configuration object.
 * Supports: --model, --prompt, --stream, --max-tokens, --temperature, --top-p, --proxy-url, --port, --help
 */
function parseArgs(argv) {
  const out = {
    model: 'gemini-3-flash',
    prompt: 'Say hi',
    stream: false,
    profile: null,
    max_tokens: 256,
    temperature: 0.7,
    top_p: 0.9,
    proxyUrl: 'http://localhost:3402',
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model' && argv[i + 1]) out.model = argv[++i];
    else if (a === '--prompt' && argv[i + 1]) out.prompt = argv[++i];
    else if (a === '--stream') out.stream = true;
    else if (a === '--profile' && argv[i + 1]) out.profile = argv[++i];
    else if (a === '--max-tokens' && argv[i + 1]) out.max_tokens = Number(argv[++i]) || out.max_tokens;
    else if (a === '--temperature' && argv[i + 1]) out.temperature = Number(argv[++i]) || out.temperature;
    else if (a === '--top-p' && argv[i + 1]) out.top_p = Number(argv[++i]) || out.top_p;
    else if (a === '--proxy-url' && argv[i + 1]) out.proxyUrl = argv[++i];
    else if (a === '--port' && argv[i + 1]) out.proxyUrl = `http://localhost:${Number(argv[++i]) || 3402}`;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

/**
 * printUsage
 * Prints usage information for the CLI wrapper with examples.
 */
function printUsage() {
  console.log('Smart-Router Model Test CLI');
  console.log('Usage: node scripts/test-model-cli.js [--model <name>] [--prompt <text>] [--stream] [--profile <provider:label>] [--max-tokens <n>] [--temperature <n>] [--top-p <n>] [--proxy-url <url>] [--port <p>]');
  console.log('');
  console.log('Examples:');
  console.log('  node scripts/test-model-cli.js --model gemini-3-flash --prompt "Say hi"');
  console.log('  node scripts/test-model-cli.js --model claude-sonnet-4.5 --prompt "Explain recursion" --max-tokens 128');
  console.log('  node scripts/test-model-cli.js --model flash --prompt "Stream a poem" --stream');
  console.log('  node scripts/test-model-cli.js --model gemini --prompt "What is 2+2?" --port 3402');
  console.log('  node scripts/test-model-cli.js --model antigravity/gemini-3-flash --prompt "Use this account" --profile antigravity:work');
}

/**
 * buildBody
 * Builds the POST body for the OpenAI-compatible /v1/chat/completions endpoint on the proxy.
 */
function buildBody(cfg) {
  const body = {
    model: cfg.model,
    messages: [{ role: 'user', content: cfg.prompt }],
    max_tokens: cfg.max_tokens,
    temperature: cfg.temperature,
    top_p: cfg.top_p,
    stream: cfg.stream,
  };
  if (cfg.profile) {
    body.profile = cfg.profile;
  }
  return body;
}

/**
 * sendNonStreaming
 * Sends a non-streaming request to the proxy and prints a clean result summary.
 */
async function sendNonStreaming(proxyUrl, body) {
  const url = `${proxyUrl}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json' },
      body.profile ? { 'X-Smart-Router-Profile': body.profile } : {}
    ),
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`HTTP ${res.status}`);
  try {
    const json = JSON.parse(text);
    const content = json?.choices?.[0]?.message?.content ?? '';
    console.log(`Model: ${json?.model ?? 'unknown'}`);
    console.log(`Response:\n${content}`);
    if (json?.usage) {
      console.log(`Usage: ${JSON.stringify(json.usage)}`);
    }
  } catch {
    console.log(text);
  }
}

/**
 * tryExtractTextFromEvent
 * Tries to extract text content from a JSON SSE event supporting multiple shapes.
 * Supports both OpenAI-style delta and Antigravity Cloud Code style candidates/parts.
 */
function tryExtractTextFromEvent(obj) {
  // OpenAI-style: choices[0].delta.content
  const openaiDelta = obj?.choices?.[0]?.delta?.content;
  if (typeof openaiDelta === 'string') return openaiDelta;
  // Cloud Code style: response.candidates[0].content.parts[].text
  const parts = obj?.response?.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    let buf = '';
    for (const p of parts) {
      if (typeof p?.text === 'string') buf += p.text;
    }
    if (buf) return buf;
  }
  // Fallback: content field directly
  if (typeof obj?.content === 'string') return obj.content;
  return '';
}

/**
 * sendStreaming
 * Sends a streaming request to the proxy and prints tokens as they arrive.
 * Accumulates final text and prints a short summary at the end.
 */
async function sendStreaming(proxyUrl, body) {
  const url = `${proxyUrl}/v1/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: Object.assign(
      { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body.profile ? { 'X-Smart-Router-Profile': body.profile } : {}
    ),
    body: JSON.stringify(body),
  });
  console.log(`HTTP ${res.status}`);
  if (!res.ok || !res.body) {
    const t = await res.text();
    console.log(t);
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let finalText = '';
  console.log('Streaming:');
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value);
    const lines = chunk.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed === 'data: [DONE]') {
        console.log('\n[DONE]');
        break;
      }
      if (trimmed.startsWith('data: ')) {
        const payload = trimmed.slice(6);
        try {
          const obj = JSON.parse(payload);
          const piece = tryExtractTextFromEvent(obj);
          if (piece) {
            finalText += piece;
            process.stdout.write(piece);
          }
        } catch {
          // Print raw if not JSON
          process.stdout.write(payload);
        }
      }
    }
  }
  console.log('\n\nFinal Response:\n' + finalText);
}

/**
 * main
 * Entry point for the CLI wrapper. Parses args and runs non-stream or stream mode.
 */
async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  if (cfg.help) {
    printUsage();
    return;
  }
  console.log('Smart-Router Model Test CLI');
  console.log(`Proxy: ${cfg.proxyUrl}`);
  console.log(`Model: ${cfg.model}`);
  console.log(`Prompt: ${cfg.prompt}`);
  console.log(`Stream: ${cfg.stream ? 'on' : 'off'}`);
  const body = buildBody(cfg);
  const start = Date.now();
  try {
    if (cfg.stream) {
      await sendStreaming(cfg.proxyUrl, body);
    } else {
      await sendNonStreaming(cfg.proxyUrl, body);
    }
  } catch (err) {
    console.error('Error:', err?.message || String(err));
  } finally {
    const ms = Date.now() - start;
    console.log(`Elapsed: ${ms}ms`);
  }
}

// Always run main when executed via Node on Windows paths (robust to argv differences)
main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
