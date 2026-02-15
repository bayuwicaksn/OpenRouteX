import type { Provider, ChatCompletionRequest, ProfileCredential, LoginContext } from "../types.js";

// ── Copilot Proxy (local VS Code Copilot models) ────────────────────

export const copilotProxyProvider: Provider = {
    id: "copilot-proxy",
    name: "Copilot Proxy (Local)",
    baseUrl: process.env.COPILOT_PROXY_URL ?? "http://localhost:3000/v1",
    supportsStreaming: true,

    async login(ctx: LoginContext): Promise<ProfileCredential> {
        const url = await ctx.prompt("Enter Copilot proxy base URL (e.g. http://localhost:3000/v1):");
        return {
            type: "api_key",
            provider: "copilot-proxy",
            key: "copilot-proxy",
            metadata: { baseUrl: url.trim() },
        };
    },

    getHeaders(_cred: ProfileCredential): Record<string, string> {
        return { "Content-Type": "application/json" };
    },

    formatRequest(body: ChatCompletionRequest): unknown {
        return body;
    },
};
