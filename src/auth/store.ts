import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
    AuthProfileStore,
    ProfileCredential,
    ProfileUsageStats,
    FailureReason,
} from "../shared/types.js";
import { logger } from "../shared/logger.js";
import { getProvider } from "../providers/index.js";

// ── Store path ──────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORE_PATH = join(__dirname, "..", "..", "data", "auth-store.json");

function getStorePath(): string {
    const p = process.env.SMART_ROUTER_AUTH_STORE ?? DEFAULT_STORE_PATH;
    return p;
}

// ── Load / Save ─────────────────────────────────────────────────────

function emptyStore(): AuthProfileStore {
    return { version: 1, profiles: {}, usageStats: {} };
}

export function loadStore(): AuthProfileStore {
    const path = getStorePath();
    if (!existsSync(path)) {
        logger.info(`[AuthStore] No store found at ${path}, creating new.`);
        return emptyStore();
    }
    try {
        const raw = readFileSync(path, "utf8");
        const data = JSON.parse(raw) as AuthProfileStore;
        return {
            version: data.version ?? 1,
            profiles: data.profiles ?? {},
            usageStats: data.usageStats ?? {},
        };
    } catch (err) {
        logger.error(`[AuthStore] Failed to load auth store from ${path}:`, err);
        return emptyStore();
    }
}

export function saveStore(store: AuthProfileStore): void {
    const path = getStorePath();
    const dir = dirname(path);
    try {
        if (!existsSync(dir)) {
            mkdirSync(dir, { recursive: true });
        }
        writeFileSync(path, JSON.stringify(store, null, 2) + "\n", "utf8");
    } catch (err) {
        logger.error(`[AuthStore] Failed to save auth store to ${path}:`, err);
        throw err;
    }
}

// ── Profile CRUD ────────────────────────────────────────────────────

export function buildProfileId(provider: string, label?: string): string {
    return `${provider}:${label ?? "default"}`;
}

export function upsertProfile(
    provider: string,
    credential: ProfileCredential,
    label?: string,
): string {
    const store = loadStore();
    const profileId = buildProfileId(provider, label);
    store.profiles[profileId] = credential;
    store.usageStats[profileId] = { state: "ACTIVE", errorCount: 0 };
    saveStore(store);
    logger.ok(`Auth profile saved: ${profileId}`);
    return profileId;
}

export function removeProfile(profileId: string): boolean {
    const store = loadStore();
    if (!store.profiles[profileId]) return false;
    delete store.profiles[profileId];
    delete store.usageStats[profileId];
    saveStore(store);
    logger.info(`Removed profile: ${profileId}`);
    return true;
}

// ── Query ───────────────────────────────────────────────────────────

export function listProfilesForProvider(provider: string): string[] {
    const store = loadStore();
    return Object.entries(store.profiles)
        .filter(([, cred]) => cred.provider === provider)
        .map(([id]) => id);
}

export function listAllProfiles(): Array<{
    id: string;
    provider: string;
    type: string;
    email?: string;
    inCooldown: boolean;
}> {
    const store = loadStore();
    const now = Date.now();
    return Object.entries(store.profiles).map(([id, cred]) => {
        const stats = store.usageStats[id] || { state: "ACTIVE" as const };
        const cooldownUntil = stats.cooldownUntil ?? 0;

        let currentState = stats.state || "ACTIVE";
        if (currentState === "ACTIVE" && now < cooldownUntil) {
            currentState = "COOLDOWN";
        }

        return {
            id,
            provider: cred.provider,
            type: cred.type,
            email: "email" in cred ? cred.email : undefined,
            state: currentState as any,
            cooldownUntil: cooldownUntil > 0 ? cooldownUntil : undefined,
            inCooldown: now < cooldownUntil || currentState === "DISABLED",
        };
    });
}

export function getAvailableProviders(): Set<string> {
    const store = loadStore();
    const providers = new Set<string>();

    for (const cred of Object.values(store.profiles)) {
        providers.add(cred.provider);
    }

    const envMap: Record<string, string> = {
        OPENAI_API_KEY: "openai",
        GEMINI_API_KEY: "google",
        DASHSCOPE_API_KEY: "qwen-dashscope",
        ANTHROPIC_API_KEY: "anthropic",
        DEEPSEEK_API_KEY: "deepseek",
        XAI_API_KEY: "xai",
        GROQ_API_KEY: "groq",
        OPENROUTER_API_KEY: "openrouter",
    };

    for (const [envVar, provider] of Object.entries(envMap)) {
        if (process.env[envVar]) {
            providers.add(provider);
        }
    }

    return providers;
}

// ── Round-robin profile selection ───────────────────────────────────

export function pickNextProfile(provider: string, modelId?: string): {
    profileId: string;
    credential: ProfileCredential;
} | null {
    const store = loadStore();
    const now = Date.now();

    const candidates = Object.entries(store.profiles)
        .filter(([, cred]) => cred.provider === provider)
        .map(([id, cred]) => {
            const stats = store.usageStats[id] ?? {};
            return { id, cred, stats };
        });

    if (candidates.length === 0) return null;

    const available = candidates.filter((c) => {
        const stats = c.stats as ProfileUsageStats;
        if (stats.state === "DISABLED") return false;

        const until = stats.cooldownUntil ?? 0;
        if (now < until) return false;

        if (modelId && stats.modelCooldowns?.[modelId]) {
            if (now < stats.modelCooldowns[modelId]) return false;
        }

        if (modelId && stats.modelCooldowns?.[modelId]) {
            if (now < stats.modelCooldowns[modelId]) return false;
        }

        const providerDef = getProvider(provider);
        const rpmLimit = providerDef?.rateLimits?.requestsPerMinute;
        if (rpmLimit && stats.rateLimitStats) {
            const { windowStart, requestCount } = stats.rateLimitStats;
            const windowElapsed = now - windowStart;

            if (windowElapsed < 60000 && requestCount >= rpmLimit) {
                return false;
            }
        }

        return true;
    });

    if (available.length === 0) {
        return null;
    }

    available.sort((a, b) => (a.stats.lastUsed ?? 0) - (b.stats.lastUsed ?? 0));
    const picked = available[0]!;

    return { profileId: picked.id, credential: picked.cred };
}

export function getApiKeyForProvider(provider: string): string | null {
    const envMap: Record<string, string> = {
        openai: "OPENAI_API_KEY",
        google: "GEMINI_API_KEY",
        "qwen-dashscope": "DASHSCOPE_API_KEY",
        anthropic: "ANTHROPIC_API_KEY",
        deepseek: "DEEPSEEK_API_KEY",
        xai: "XAI_API_KEY",
        groq: "GROQ_API_KEY",
        openrouter: "OPENROUTER_API_KEY",
    };

    const envVar = envMap[provider];
    if (!envVar) return null;
    return process.env[envVar] ?? null;
}

// ── Usage tracking ──────────────────────────────────────────────────

export function markProfileUsed(profileId: string): void {
    const store = loadStore();
    store.usageStats[profileId] = {
        ...store.usageStats[profileId],
        state: "ACTIVE",
        lastUsed: Date.now(),
        errorCount: 0,
        cooldownUntil: undefined,
        failureReason: undefined,
    } as ProfileUsageStats;
    saveStore(store);
}

export function incrementProfileUsage(profileId: string, providerId: string): void {
    const store = loadStore();
    const now = Date.now();
    const existing = store.usageStats[profileId] ?? { state: "ACTIVE" };

    let stats = existing.rateLimitStats;

    if (!stats || (now - stats.windowStart) >= 60000) {
        stats = { windowStart: now, requestCount: 0 };
    }

    stats.requestCount++;

    store.usageStats[profileId] = {
        ...existing,
        lastUsed: now,
        rateLimitStats: stats,
    } as ProfileUsageStats;

    saveStore(store);
}

function calculateCooldownMs(errorCount: number): number {
    const sequence = [
        30 * 1000,
        60 * 1000,
        120 * 1000,
        300 * 1000,
        600 * 1000,
    ];
    const n = Math.max(1, errorCount);
    return sequence[Math.min(n - 1, sequence.length - 1)];
}

export function markProfileFailure(
    profileId: string,
    reason: FailureReason = "unknown",
    explicitCooldownMs?: number,
    modelId?: string,
): void {
    const store = loadStore();
    const existing = store.usageStats[profileId] ?? {};

    // For model-specific failures, only apply model-level cooldown
    // Do NOT increment global errorCount or set global cooldownUntil
    const isModelSpecific = modelId && (reason === "rate_limit" || reason === "model_not_found");

    const modelCooldowns = existing.modelCooldowns ?? {};

    if (isModelSpecific) {
        // Model-specific cooldown only — don't touch global state
        let cooldownMs = explicitCooldownMs ?? 60_000; // Default 60s for model-specific
        if (profileId.startsWith("antigravity") && !explicitCooldownMs && reason === "rate_limit") {
            cooldownMs = 5 * 60 * 1000; // 5 min for Antigravity rate limits
        }
        modelCooldowns[modelId] = Date.now() + cooldownMs;

        store.usageStats[profileId] = {
            ...existing,
            // Keep state and errorCount UNCHANGED — this is model-specific, not profile-wide
            state: existing.state === "DISABLED" ? "DISABLED" : (existing.state ?? "ACTIVE"),
            modelCooldowns,
            lastFailureAt: Date.now(),
            failureReason: reason,
        } as ProfileUsageStats;
        saveStore(store);

        logger.warn(
            `Profile ${profileId} (model ${modelId}) failed (${reason}), cooldown ${Math.round(cooldownMs / 1000)}s`,
        );
        return;
    }

    // Global failure — increment errorCount and apply profile-level cooldown
    const errorCount = (existing.errorCount ?? 0) + 1;
    let cooldownMs = explicitCooldownMs ?? calculateCooldownMs(errorCount);

    if (profileId.startsWith("antigravity") && !explicitCooldownMs && reason === "rate_limit") {
        cooldownMs = 5 * 60 * 60 * 1000;
    }

    const cooldownUntil = Date.now() + cooldownMs;

    let newState: "COOLDOWN" | "DISABLED" | "ACTIVE" = "COOLDOWN";
    if (reason === "auth" || reason === "billing") {
        newState = "DISABLED";
    }

    store.usageStats[profileId] = {
        ...existing,
        state: newState,
        errorCount,
        cooldownUntil,
        modelCooldowns,
        lastFailureAt: Date.now(),
        failureReason: reason,
    } as ProfileUsageStats;
    saveStore(store);

    const target = "profile";
    logger.warn(
        `Profile ${profileId} (${target}) failed (${reason}), cooldown ${Math.round(cooldownMs / 1000)}s`,
    );
}

export function clearProfileCooldown(profileId: string): void {
    const store = loadStore();
    if (store.usageStats[profileId]) {
        store.usageStats[profileId] = {
            ...store.usageStats[profileId],
            state: "ACTIVE",
            errorCount: 0,
            cooldownUntil: undefined,
            failureReason: undefined,
        } as ProfileUsageStats;
        saveStore(store);
    }
}
