import type { RoutingConfig, Tier, ModelRoute } from "./types.js";

// ── 14 Dimension keyword lists ──────────────────────────────────────

const DIMENSION_KEYWORDS: Record<string, string[]> = {
    code_generation: [
        "write code", "implement", "create function", "build", "generate code",
        "coding", "program", "develop", "scaffold", "boilerplate", "refactor",
        "class", "method", "algorithm", "data structure", "api", "endpoint",
    ],
    debugging: [
        "debug", "fix", "error", "bug", "issue", "broken", "not working",
        "crash", "exception", "stack trace", "troubleshoot", "diagnose",
    ],
    explanation: [
        "explain", "what is", "how does", "describe", "tell me about",
        "understand", "clarify", "elaborate", "break down", "overview",
    ],
    math_logic: [
        "calculate", "math", "equation", "formula", "proof", "theorem",
        "algebra", "calculus", "statistics", "probability", "optimize",
        "linear", "matrix", "derivative", "integral",
    ],
    creative_writing: [
        "write story", "poem", "creative", "fiction", "narrative",
        "dialogue", "character", "plot", "screenplay", "lyrics",
        "compose", "draft", "essay",
    ],
    translation: [
        "translate", "convert to", "in spanish", "in french", "in chinese",
        "in japanese", "in german", "multilingual", "localize", "i18n",
    ],
    data_analysis: [
        "analyze data", "dataset", "csv", "json", "parse", "extract",
        "transform", "aggregate", "statistics", "visualization", "chart",
        "graph", "sql", "query", "database",
    ],
    system_design: [
        "architecture", "design system", "scalable", "microservice",
        "distributed", "load balancing", "caching", "database design",
        "infrastructure", "deployment", "ci/cd", "docker", "kubernetes",
    ],
    security: [
        "security", "vulnerability", "exploit", "authentication",
        "authorization", "encrypt", "hash", "ssl", "tls", "oauth",
        "xss", "csrf", "injection", "pentest",
    ],
    research: [
        "research", "paper", "study", "literature", "survey",
        "state of the art", "benchmark", "comparison", "evaluation",
        "arxiv", "peer review",
    ],
    reasoning: [
        "think step by step", "reason", "logical", "deduce", "infer",
        "chain of thought", "multi-step", "complex problem", "planning",
        "strategy", "tradeoff", "pros and cons", "decision",
    ],
    conversation: [
        "chat", "hello", "hi", "hey", "thanks", "good morning",
        "how are you", "goodbye", "yes", "no", "ok", "sure",
    ],
    summarization: [
        "summarize", "summary", "tldr", "key points", "bullet points",
        "condense", "shorten", "brief", "recap", "outline",
    ],
    multimodal: [
        "image", "picture", "photo", "screenshot", "diagram",
        "vision", "visual", "ocr", "describe image", "analyze image",
    ],
};

// ── Dimension weights ───────────────────────────────────────────────

const DEFAULT_WEIGHTS: Record<string, number> = {
    code_generation: 3.0,
    debugging: 2.5,
    explanation: 1.0,
    math_logic: 3.0,
    creative_writing: 1.5,
    translation: 1.0,
    data_analysis: 2.5,
    system_design: 3.0,
    security: 2.5,
    research: 2.0,
    reasoning: 3.5,
    conversation: 0.5,
    summarization: 1.0,
    multimodal: 2.0,
};

// ── Tier boundaries ─────────────────────────────────────────────────

const DEFAULT_TIER_BOUNDARIES: Record<Tier, { min: number; max: number }> = {
    SIMPLE: { min: 0, max: 3 },
    MEDIUM: { min: 3, max: 8 },
    COMPLEX: { min: 8, max: 15 },
    REASONING: { min: 15, max: Infinity },
};

// ── Default tier → model mapping ────────────────────────────────────

const DEFAULT_TIER_MODELS: Record<Tier, ModelRoute[]> = {
    SIMPLE: [
        { model: "gemini-3-flash", provider: "antigravity" },
        { model: "gemini-3-flash-preview", provider: "antigravity" },
        { model: "MiniMax-M2.5", provider: "minimax-portal" },
        { model: "coder-model", provider: "qwen-portal" },
        { model: "gpt-5.2-codex", provider: "openai-codex" },
        { model: "gemini-2.0-flash", provider: "google" },
        { model: "gpt-4.1-mini", provider: "openai" },
        { model: "deepseek-chat", provider: "deepseek" },
    ],
    MEDIUM: [
        { model: "gemini-3-pro", provider: "antigravity" },
        { model: "minimax-m2.1", provider: "nvidia" }, // Added
        { model: "kimi-k2.5", provider: "nvidia" },     // Added
        { model: "coder-model", provider: "qwen-portal" },
        { model: "gpt-5.2-codex", provider: "openai-codex" },
        { model: "MiniMax-M2.5", provider: "minimax-portal" },
        { model: "gemini-2.5-flash", provider: "google" },
        { model: "gpt-4.1", provider: "openai" },
        { model: "claude-sonnet-4-5-20250514", provider: "anthropic" },
    ],
    COMPLEX: [
        { model: "deepseek-v3.2", provider: "nvidia" }, // Added
        { model: "qwen-3.5-397b", provider: "nvidia" }, // Added
        { model: "gemini-3-pro", provider: "antigravity" },
        { model: "claude-opus-4-6", provider: "antigravity" },
        { model: "gpt-5.2-codex", provider: "openai-codex" },
        { model: "coder-model", provider: "qwen-portal" },
        { model: "gemini-2.5-pro", provider: "google" },
        { model: "claude-opus-4-20250512", provider: "anthropic" },
    ],
    REASONING: [
        { model: "glm-5", provider: "nvidia" },         // Added
        { model: "qwen-3.5-397b", provider: "nvidia" }, // Added
        { model: "gemini-3-pro", provider: "antigravity" },
        { model: "gpt-5.3-codex", provider: "openai-codex" },
        { model: "coder-model", provider: "qwen-portal" },
        { model: "claude-opus-4-6", provider: "antigravity" },
        { model: "o3", provider: "openai" },
        { model: "gemini-2.5-pro", provider: "google" },
    ],
};

// ── Default fallback order ──────────────────────────────────────────

const DEFAULT_FALLBACK_ORDER = [
    "antigravity", "nvidia", "qwen-portal", "minimax-portal",
    "google", "deepseek", "groq",
    "openai-codex", "github-copilot", "copilot-proxy",
    "openai", "anthropic", "xai", "openrouter",
    "qwen-dashscope",
];

// ── Export ───────────────────────────────────────────────────────────

export const DIMENSION_KEYWORD_MAP = DIMENSION_KEYWORDS;

export function getDefaultConfig(): RoutingConfig {
    return {
        weights: { ...DEFAULT_WEIGHTS },
        tierBoundaries: structuredClone(DEFAULT_TIER_BOUNDARIES),
        tierModels: structuredClone(DEFAULT_TIER_MODELS),
        fallbackOrder: [...DEFAULT_FALLBACK_ORDER],
    };
}
