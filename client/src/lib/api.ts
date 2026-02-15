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
