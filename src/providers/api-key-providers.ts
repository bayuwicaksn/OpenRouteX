import { createApiKeyProvider } from "./base.js";
import type { Provider } from "../types.js";

// 1. OpenAI
export const openaiProvider: Provider = createApiKeyProvider({
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    envVar: "OPENAI_API_KEY",
    rateLimits: {
        requestsPerMinute: 500, // Standard tier
    },
});

// 2. Google Gemini
export const googleProvider: Provider = createApiKeyProvider({
    id: "google",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    envVar: "GEMINI_API_KEY",
    rateLimits: {
        requestsPerMinute: 15, // Free tier default
    },
});

// 3. Qwen DashScope
export const qwenDashscopeProvider: Provider = createApiKeyProvider({
    id: "qwen-dashscope",
    name: "Qwen DashScope",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    envVar: "DASHSCOPE_API_KEY",
});

// 4. Anthropic
export const anthropicProvider: Provider = createApiKeyProvider({
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    envVar: "ANTHROPIC_API_KEY",
    headerStyle: "x-api-key",
    extraHeaders: { "anthropic-version": "2023-06-01" },
});

// 5. DeepSeek
export const deepseekProvider: Provider = createApiKeyProvider({
    id: "deepseek",
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/v1",
    envVar: "DEEPSEEK_API_KEY",
});

// 6. xAI (Grok)
export const xaiProvider: Provider = createApiKeyProvider({
    id: "xai",
    name: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    envVar: "XAI_API_KEY",
});

// 7. Groq
export const groqProvider: Provider = createApiKeyProvider({
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    envVar: "GROQ_API_KEY",
    rateLimits: {
        requestsPerMinute: 30, // Groq free tier is fast but limited
    },
});

// 8. OpenRouter
export const openrouterProvider: Provider = createApiKeyProvider({
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    envVar: "OPENROUTER_API_KEY",
    extraHeaders: { "HTTP-Referer": "https://github.com/smart-router" },
});
