/**
 * Model registry — maps providers to their available models.
 */

export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  contextWindow: number;
  maxOutput?: number;
  pricing?: { input: number; output: number }; // per 1M tokens in USD
  capabilities: string[];
  free: boolean;
  publicId?: string; // e.g. "google/gemini-2.0-flash"
};

// ── Antigravity (Google Cloud Code Assist) ──────────────────────────

const ANTIGRAVITY_MODELS: ModelInfo[] = [
  {
    id: "gemini-3-pro-high",
    name: "Gemini 3 Pro (High)",
    provider: "antigravity",
    publicId: "antigravity/gemini-3-pro-high",
    contextWindow: 1_000_000,
    capabilities: ["code", "reasoning", "analysis"],
    free: true,
  },
  {
    id: "gemini-3-pro-low",
    name: "Gemini 3 Pro (Low)",
    provider: "antigravity",
    publicId: "antigravity/gemini-3-pro-low",
    contextWindow: 1_000_000,
    capabilities: ["code", "chat"],
    free: true,
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "antigravity",
    publicId: "antigravity/gemini-3-pro",
    contextWindow: 1_000_000,
    capabilities: ["code", "reasoning", "analysis"],
    free: true,
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "antigravity",
    publicId: "antigravity/gemini-3-flash",
    contextWindow: 1_000_000,
    pricing: { input: 0.075, output: 0.3 },
    capabilities: ["code", "chat", "fast"],
    free: true,
  },
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    provider: "antigravity",
    publicId: "antigravity/claude-opus-4-5",
    contextWindow: 200_000,
    capabilities: ["code", "reasoning"],
    free: true,
  },
  {
    id: "claude-opus-4.5-thinking",
    name: "Claude Opus 4.5 (Thinking)",
    provider: "antigravity",
    publicId: "antigravity/claude-opus-4.5-thinking",
    contextWindow: 200_000,
    capabilities: ["code", "reasoning"],
    free: true,
  },
  {
    id: "claude-opus-4-6",
    name: "Claude Opus 4.6",
    provider: "antigravity",
    publicId: "antigravity/claude-opus-4-6",
    contextWindow: 200_000,
    capabilities: ["code", "reasoning"],
    free: true,
  },
  {
    id: "claude-opus-4-6-thinking",
    name: "Claude Opus 4.6 (Thinking)",
    provider: "antigravity",
    publicId: "antigravity/claude-opus-4-6-thinking",
    contextWindow: 200_000,
    pricing: { input: 15, output: 75 },
    capabilities: ["code", "reasoning", "thinking"],
    free: true,
  },
  {
    id: "claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "antigravity",
    publicId: "antigravity/claude-sonnet-4.5",
    contextWindow: 200_000,
    capabilities: ["code", "reasoning"],
    free: true,
  },
  {
    id: "claude-sonnet-4.5-thinking",
    name: "Claude Sonnet 4.5 (Thinking)",
    provider: "antigravity",
    publicId: "antigravity/claude-sonnet-4.5-thinking",
    contextWindow: 200_000,
    capabilities: ["code", "reasoning", "thinking"],
    free: true,
  },
  {
    id: "claude-sonnet-3-7-thinking",
    name: "Claude Sonnet 3.7 (Thinking)",
    provider: "antigravity",
    publicId: "antigravity/claude-sonnet-3-7-thinking",
    contextWindow: 200_000,
    capabilities: ["code", "reasoning", "thinking"],
    free: true,
  },
  // Aliases for user convenience
  {
    id: "opus",
    name: "Claude Opus (Alias)",
    provider: "antigravity",
    publicId: "antigravity/opus",
    contextWindow: 200_000,
    capabilities: ["code", "reasoning"],
    free: true,
  },
  {
    id: "sonnet",
    name: "Claude Sonnet (Alias)",
    provider: "antigravity",
    publicId: "antigravity/sonnet",
    contextWindow: 200_000,
    capabilities: ["code", "reasoning"],
    free: true,
  },
  {
    id: "gemini",
    name: "Gemini (Alias)",
    provider: "antigravity",
    publicId: "antigravity/gemini",
    contextWindow: 1_000_000,
    capabilities: ["code", "reasoning", "analysis"],
    free: true,
  },
  {
    id: "flash",
    name: "Gemini Flash (Alias)",
    provider: "antigravity",
    publicId: "antigravity/flash",
    contextWindow: 1_000_000,
    capabilities: ["code", "chat"],
    free: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "antigravity",
    publicId: "antigravity/gemini-2.5-pro",
    contextWindow: 2_000_000,
    pricing: { input: 3, output: 9 },
    capabilities: ["code", "reasoning", "complex"],
    free: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "antigravity",
    publicId: "antigravity/gemini-2.5-flash",
    contextWindow: 1_000_000,
    pricing: { input: 0.1, output: 0.4 },
    capabilities: ["code", "chat", "fast"],
    free: true,
  },
  {
    id: "gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "antigravity",
    publicId: "antigravity/gemini-2.5-flash-lite",
    contextWindow: 1_000_000,
    pricing: { input: 0.05, output: 0.2 },
    capabilities: ["chat", "fast", "simple"],
    free: true,
  },
  // ── Internal / Stack Models ──
  {
    id: "nano-banana-pro",
    name: "Nano Banana Pro",
    provider: "antigravity",
    publicId: "antigravity/nano-banana-pro",
    contextWindow: 32_000,
    capabilities: ["image-generation", "ui-mockup", "diagrams"],
    free: true,
  },
];

// ── OpenAI Codex ────────────────────────────────────────────────────

const OPENAI_CODEX_MODELS: ModelInfo[] = [
  {
    id: "gpt-5.1-codex",
    name: "GPT-5.1 Codex",
    provider: "openai-codex",
    publicId: "openai/gpt-5.1-codex",
    contextWindow: 128_000,
    pricing: { input: 2, output: 8 },
    capabilities: ["code"],
    free: false,
  },
  {
    id: "gpt-5.2-codex",
    name: "GPT-5.2 Codex",
    provider: "openai-codex",
    publicId: "openai/gpt-5.2-codex",
    contextWindow: 128_000,
    pricing: { input: 2, output: 8 },
    capabilities: ["code", "reasoning"],
    free: false,
  },
  {
    id: "gpt-5.3-codex",
    name: "GPT-5.3 Codex",
    provider: "openai-codex",
    publicId: "openai/gpt-5.3-codex",
    contextWindow: 128_000,
    pricing: { input: 2, output: 8 },
    capabilities: ["code", "reasoning"],
    free: false,
  },
];

// ── GitHub Copilot ──────────────────────────────────────────────────

const GITHUB_COPILOT_MODELS: ModelInfo[] = [
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    provider: "github-copilot",
    publicId: "openai/gpt-4o",
    contextWindow: 128_000,
    capabilities: ["code"],
    free: false,
  },
  {
    id: "claude-opus-4.6",
    name: "Claude Opus 4.6",
    provider: "github-copilot",
    publicId: "anthropic/claude-3.5-sonnet",
    contextWindow: 200_000,
    capabilities: ["code", "reasoning"],
    free: false,
  },
  {
    id: "gemini-3-pro",
    name: "Gemini 3 Pro",
    provider: "github-copilot",
    publicId: "google/gemini-pro",
    contextWindow: 1_000_000,
    capabilities: ["code"],
    free: false,
  },
];

// ── Qwen Portal ─────────────────────────────────────────────────────

const QWEN_PORTAL_MODELS: ModelInfo[] = [
  {
    id: "qwen-max",
    name: "Qwen Max",
    provider: "qwen-portal",
    publicId: "qwen/qwen-max",
    contextWindow: 32_000,
    capabilities: ["code", "reasoning"],
    free: true,
  },
  {
    id: "coder-model",
    name: "Qwen Coder",
    provider: "qwen-portal",
    publicId: "qwen/qwen-coder",
    contextWindow: 32_000,
    capabilities: ["code"],
    free: true,
  },
  {
    id: "vision-model",
    name: "Qwen Vision",
    provider: "qwen-portal",
    publicId: "qwen/qwen-vl",
    contextWindow: 32_000,
    capabilities: ["vision"],
    free: true,
  },
];

// ── MiniMax Portal ──────────────────────────────────────────────────

const MINIMAX_MODELS: ModelInfo[] = [
  {
    id: "MiniMax-M2.1",
    name: "MiniMax M2.1",
    provider: "minimax-portal",
    publicId: "minimax/minimax-2.1",
    contextWindow: 128_000,
    capabilities: ["code", "reasoning"],
    free: true,
  },
  {
    id: "MiniMax-M2.1-lightning",
    name: "MiniMax M2.1 Lightning",
    provider: "minimax-portal",
    publicId: "minimax/minimax-2.1-lightning",
    contextWindow: 128_000,
    capabilities: ["code", "fast"],
    free: true,
  },
  {
    id: "MiniMax-M2.5",
    name: "MiniMax M2.5",
    provider: "minimax-portal",
    publicId: "minimax/minimax-2.5",
    contextWindow: 245_000,
    capabilities: ["code", "reasoning", "long_context"],
    free: true,
  },
  {
    id: "MiniMax-M2.5-lightning",
    name: "MiniMax M2.5 Lightning",
    provider: "minimax-portal",
    publicId: "minimax/minimax-2.5-lightning",
    contextWindow: 245_000,
    capabilities: ["code", "fast"],
    free: true,
  },
];

// ── Standard API Key providers ──────────────────────────────────────

const OPENAI_MODELS: ModelInfo[] = [
  {
    id: "gpt-4.1-mini",
    name: "GPT-4.1 Mini",
    provider: "openai",
    publicId: "openai/gpt-4o-mini",
    contextWindow: 128_000,
    pricing: { input: 0.4, output: 1.6 },
    capabilities: ["code", "chat"],
    free: false,
  },
  {
    id: "gpt-4.1",
    name: "GPT-4.1",
    provider: "openai",
    publicId: "openai/gpt-4o",
    contextWindow: 128_000,
    pricing: { input: 2, output: 8 },
    capabilities: ["code", "reasoning"],
    free: false,
  },
  {
    id: "o3",
    name: "o3",
    provider: "openai",
    publicId: "openai/o3-mini",
    contextWindow: 200_000,
    pricing: { input: 10, output: 40 },
    capabilities: ["reasoning"],
    free: false,
  },
];

const GOOGLE_MODELS: ModelInfo[] = [
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    provider: "google",
    publicId: "google/gemini-2.0-flash-001",
    contextWindow: 1_000_000,
    capabilities: ["code", "fast"],
    free: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    publicId: "google/gemini-2.0-flash-lite-preview-02-05",
    contextWindow: 1_000_000,
    capabilities: ["code", "reasoning"],
    free: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    publicId: "google/gemini-2.0-pro-exp-02-05",
    contextWindow: 1_000_000,
    pricing: { input: 1.25, output: 10 },
    capabilities: ["code", "reasoning"],
    free: false,
  },
];

const ANTHROPIC_MODELS: ModelInfo[] = [
  {
    id: "claude-sonnet-4-5-20250514",
    name: "Claude Sonnet 4.5",
    provider: "anthropic",
    publicId: "anthropic/claude-3.5-sonnet",
    contextWindow: 200_000,
    pricing: { input: 3, output: 15 },
    capabilities: ["code", "reasoning"],
    free: false,
  },
  {
    id: "claude-opus-4-20250512",
    name: "Claude Opus 4",
    provider: "anthropic",
    publicId: "anthropic/claude-3-opus",
    contextWindow: 200_000,
    pricing: { input: 15, output: 75 },
    capabilities: ["code", "reasoning"],
    free: false,
  },
];

const DEEPSEEK_MODELS: ModelInfo[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek V3",
    provider: "deepseek",
    publicId: "deepseek/deepseek-chat",
    contextWindow: 64_000,
    pricing: { input: 0.27, output: 1.1 },
    capabilities: ["code", "reasoning"],
    free: false,
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek R1",
    provider: "deepseek",
    publicId: "deepseek/deepseek-reasoner",
    contextWindow: 64_000,
    pricing: { input: 0.55, output: 2.19 },
    capabilities: ["reasoning"],
    free: false,
  },
];

const GROQ_MODELS: ModelInfo[] = [
  {
    id: "llama-3.3-70b-versatile",
    name: "Llama 3.3 70B",
    provider: "groq",
    publicId: "groq/llama-3.3-70b",
    contextWindow: 128_000,
    capabilities: ["code", "fast"],
    free: true,
  },
];

const XAI_MODELS: ModelInfo[] = [
  {
    id: "grok-3",
    name: "Grok 3",
    provider: "xai",
    publicId: "xai/grok-2",
    contextWindow: 128_000,
    pricing: { input: 3, output: 15 },
    capabilities: ["code", "reasoning"],
    free: false,
  },
];

const QWEN_DASHSCOPE_MODELS: ModelInfo[] = [
  {
    id: "qwen-max",
    name: "Qwen Max",
    provider: "qwen-dashscope",
    publicId: "qwen/qwen-max",
    contextWindow: 32_000,
    pricing: { input: 1.6, output: 6.4 },
    capabilities: ["code", "reasoning"],
    free: false,
  },
];

const OPENROUTER_MODELS: ModelInfo[] = [
  {
    id: "auto",
    name: "Auto (OpenRouteX)",
    provider: "openrouter",
    publicId: "openroutex/auto",
    contextWindow: 128_000,
    capabilities: ["code", "reasoning"],
    free: false,
  },
];

// ── Registry ────────────────────────────────────────────────────────

const ALL_MODELS: ModelInfo[] = [
  ...ANTIGRAVITY_MODELS,
  ...OPENAI_CODEX_MODELS,
  ...GITHUB_COPILOT_MODELS,
  ...QWEN_PORTAL_MODELS,
  ...MINIMAX_MODELS,
  ...OPENAI_MODELS,
  ...GOOGLE_MODELS,
  ...ANTHROPIC_MODELS,
  ...DEEPSEEK_MODELS,
  ...GROQ_MODELS,
  ...XAI_MODELS,
  ...QWEN_DASHSCOPE_MODELS,
  ...OPENROUTER_MODELS,
];

export function getModelsForProvider(providerId: string): ModelInfo[] {
  return ALL_MODELS.filter((m) => m.provider === providerId);
}

export function getAllModels(): ModelInfo[] {
  return ALL_MODELS;
}

export function findModel(modelId: string): ModelInfo | undefined {
  // 1. Exact match by internal ID
  let match = ALL_MODELS.find((m) => m.id === modelId);
  if (match) return match;

  // 2. Match by publicId (provider/model)
  match = ALL_MODELS.find((m) => m.publicId === modelId);
  if (match) return match;

  // 3. Match by just the model part of publicId (legacy support)
  // e.g. "gemini-2.0-flash" matches "google/gemini-2.0-flash"
  match = ALL_MODELS.find(
    (m) => m.publicId && m.publicId.endsWith(`/${modelId}`)
  );
  if (match) return match;

  return undefined;
}
