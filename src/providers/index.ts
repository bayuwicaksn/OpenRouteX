import type { Provider } from "../types.js";

// ── OAuth/Device code providers ─────────────────────────────────────
import { antigravityProvider } from "./antigravity.js";
import { openaiCodexProvider } from "./openai-codex.js";
import { githubCopilotProvider } from "./github-copilot.js";
import { qwenPortalProvider } from "./qwen-portal.js";
import { minimaxPortalProvider, minimaxPortalCNProvider } from "./minimax-portal.js";
import { copilotProxyProvider } from "./copilot-proxy.js";

// ── API key providers ───────────────────────────────────────────────
import {
    openaiProvider,
    googleProvider,
    qwenDashscopeProvider,
    anthropicProvider,
    deepseekProvider,
    xaiProvider,
    groqProvider,
    openrouterProvider,
} from "./api-key-providers.js";

// ── Registry ────────────────────────────────────────────────────────

const ALL_PROVIDERS: Provider[] = [
    antigravityProvider,
    openaiCodexProvider,
    githubCopilotProvider,
    qwenPortalProvider,
    minimaxPortalProvider,
    minimaxPortalCNProvider,
    copilotProxyProvider,
    openaiProvider,
    googleProvider,
    qwenDashscopeProvider,
    anthropicProvider,
    deepseekProvider,
    xaiProvider,
    groqProvider,
    openrouterProvider,
];

const providerMap = new Map<string, Provider>();
for (const p of ALL_PROVIDERS) {
    providerMap.set(p.id, p);
}

export function getProvider(id: string): Provider | undefined {
    return providerMap.get(id);
}

export function getAllProviders(): Provider[] {
    return [...ALL_PROVIDERS];
}

export function getProviderIds(): string[] {
    return ALL_PROVIDERS.map((p) => p.id);
}

// Re-export individual providers for convenience
export {
    antigravityProvider,
    openaiCodexProvider,
    githubCopilotProvider,
    qwenPortalProvider,
    minimaxPortalProvider,
    minimaxPortalCNProvider,
    copilotProxyProvider,
    openaiProvider,
    googleProvider,
    qwenDashscopeProvider,
    anthropicProvider,
    deepseekProvider,
    xaiProvider,
    groqProvider,
    openrouterProvider,
};
