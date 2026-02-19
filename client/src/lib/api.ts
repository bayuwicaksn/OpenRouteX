import axios from "axios";

export const api = axios.create({
    baseURL: "/api",
});

export interface Provider {
    id: string;
    name: string;
    baseUrl: string;
    rateLimits?: {
        requestsPerMinute: number;
        requestsPerDay?: number;
    };
}

export interface Model {
    id: string;
    name: string;
    provider: string;
    contextWindow: number;
    capabilities: string[];
}

export interface Profile {
    id: string;
    provider: string;
    state: "ACTIVE" | "COOLDOWN" | "ERROR" | "INACTIVE";
    label?: string; // Optional label/email
    type?: string; // "auth" vs "key"
    email?: string;
    usage?: {
        requests: number;
        errors: number;
    }
}

export interface RequestLog {
    timestamp: string;
    provider: string;
    model: string;
    success: boolean;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    error?: string;
}

export interface StatsSummary {
    totalRequests: number;
    successRate: number;
    avgLatencyMs: number;
    totalTokens: number;
    providerBreakdown: Record<string, number>;
}

export interface DashboardData {
    summary: StatsSummary;
    requests: RequestLog[];
    activeProviders: string[]; // List of provider IDs that are currently active
}

export interface ConfigData {
    providers: Provider[];
    models: Model[];
    profiles: Profile[];
}

export const fetchStats = async (): Promise<DashboardData> => {
    const { data } = await api.get<DashboardData>("/stats");
    return data;
};

export const fetchConfig = async (): Promise<ConfigData> => {
    const { data } = await api.get<ConfigData>("/config");
    return data;
};

export const deleteProfile = async (id: string): Promise<void> => {
    await api.delete(`/profile?id=${encodeURIComponent(id)}`);
};

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
    reasoning?: string;
}

export interface ChatCompletionRequest {
    model: string;
    messages: ChatMessage[];
    temperature?: number;
    stream?: boolean;
    enable_thinking?: boolean;
}

export interface ChatCompletionResponse {
    id: string;
    model: string;
    choices: {
        index: number;
        message: ChatMessage;
        finish_reason: string;
    }[];
}

export const sendChat = async (req: ChatCompletionRequest): Promise<ChatCompletionResponse> => {
    // We use the /v1/chat/completions endpoint which mimics OpenAI
    // We need to use the full URL because our axios instance has baseURL='/api'
    // But /v1/ is at root. 
    // Actually, let's use a separate axios call or fetch to hit /v1/chat/completions
    const res = await fetch("/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(req),
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
        throw new Error(err.error?.message || "Chat request failed");
    }

    return res.json();
};
