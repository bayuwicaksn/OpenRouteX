import type { Provider, ChatCompletionRequest, ProfileCredential, LoginContext, OAuthCredential } from "../types.js";

/**
 * Base provider with shared utilities.
 */
export function createApiKeyProvider(opts: {
    id: string;
    name: string;
    baseUrl: string;
    envVar: string;
    headerStyle?: "bearer" | "x-api-key";
    extraHeaders?: Record<string, string>;
    transformRequest?: (body: ChatCompletionRequest) => unknown;
    rateLimits?: {
        requestsPerMinute?: number;
        requestsPerDay?: number;
    };
}): Provider {
    return {
        id: opts.id,
        name: opts.name,
        baseUrl: opts.baseUrl,
        supportsStreaming: true,
        isOpenAICompatible: opts.id !== "anthropic",
        rateLimits: opts.rateLimits,

        async login(_ctx: LoginContext): Promise<ProfileCredential> {
            const key = process.env[opts.envVar];
            if (!key) {
                throw new Error(`Set ${opts.envVar} environment variable to authenticate with ${opts.name}`);
            }
            return {
                type: "api_key",
                provider: opts.id,
                key,
            };
        },

        getHeaders(cred: ProfileCredential): Record<string, string> {
            const key = cred.type === "api_key" ? cred.key : process.env[opts.envVar] ?? "";
            const headers: Record<string, string> = {
                "Content-Type": "application/json",
                ...opts.extraHeaders,
            };

            if (opts.headerStyle === "x-api-key") {
                headers["x-api-key"] = key;
            } else {
                headers["Authorization"] = `Bearer ${key}`;
            }

            return headers;
        },

        formatRequest(body: ChatCompletionRequest): unknown {
            return opts.transformRequest ? opts.transformRequest(body) : body;
        },
    };
}
