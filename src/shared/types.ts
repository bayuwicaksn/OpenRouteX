// ── Credential types ────────────────────────────────────────────────

export type OAuthCredential = {
    type: "oauth";
    provider: string;
    access: string;
    refresh: string;
    expires: number;
    email?: string;
    accountId?: string;
    projectId?: string;
    resourceUrl?: string;
};

export type ApiKeyCredential = {
    type: "api_key";
    provider: string;
    key: string;
    email?: string;
    metadata?: Record<string, string>;
};

export type TokenCredential = {
    type: "token";
    provider: string;
    token: string;
    expires?: number;
    email?: string;
};

export type ProfileCredential = OAuthCredential | ApiKeyCredential | TokenCredential;

// ── Usage tracking ──────────────────────────────────────────────────

export type FailureReason = "auth" | "rate_limit" | "billing" | "timeout" | "format" | "model_not_found" | "unknown";

export type ModelState = "ACTIVE" | "COOLDOWN" | "DISABLED";

export type ProfileUsageStats = {
    state: ModelState;
    lastUsed?: number;
    cooldownUntil?: number;
    modelCooldowns?: Record<string, number>;
    errorCount?: number;
    lastFailureAt?: number;
    failureReason?: FailureReason;
    rateLimitStats?: {
        windowStart: number;
        requestCount: number;
    };
};

// ── Auth store ──────────────────────────────────────────────────────

export type AuthProfileStore = {
    version: number;
    profiles: Record<string, ProfileCredential>;
    usageStats: Record<string, ProfileUsageStats>;
};

// ── Chat completion types ───────────────────────────────────────────

export type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | null;
    name?: string;
};

export type ChatCompletionRequest = {
    model?: string;
    messages: ChatMessage[];
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
    top_p?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    stop?: string | string[];
    [key: string]: unknown;
};

export type ChatCompletionChoice = {
    index: number;
    message: ChatMessage;
    finish_reason: string | null;
};

export type ChatCompletionResponse = {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: ChatCompletionChoice[];
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
    _routing?: {
        tier: string;
        provider: string;
        model: string;
        score: number;
        profileId: string;
    };
};

// ── Provider interface ──────────────────────────────────────────────

export type LoginContext = {
    openUrl: (url: string) => Promise<void>;
    log: (msg: string) => void;
    note: (message: string, title?: string) => Promise<void>;
    prompt: (message: string) => Promise<string>;
    progress: { update: (msg: string) => void; stop: (msg?: string) => void };
    isRemote: boolean;
};

export type Provider = {
    id: string;
    name: string;
    baseUrl: string;
    login(ctx: LoginContext, options?: Record<string, any>): Promise<ProfileCredential>;
    getHeaders(cred: ProfileCredential): Record<string, string>;
    formatRequest(body: ChatCompletionRequest): unknown;
    formatResponse?(raw: unknown, modelId?: string): ChatCompletionResponse;
    refreshToken?(cred: OAuthCredential): Promise<OAuthCredential>;
    buildUrl?(baseUrl: string, model: string): string;
    supportsStreaming?: boolean;

    isOpenAICompatible?: boolean;
    rateLimits?: {
        requestsPerMinute?: number;
        requestsPerDay?: number;
    };
};

// ── Stats ───────────────────────────────────────────────────────────

export type RequestStats = {
    timestamp: number;
    provider: string;
    model: string;
    realModel?: string; // The actual model used by the provider (after mapping)
    profileId: string;
    tier: string;
    tierScore: number;
    task: string;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd?: number;
    actualCostUsd?: number;
    success: boolean;
    error?: string;
};
