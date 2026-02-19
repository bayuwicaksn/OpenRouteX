import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type {
    AuthProfileStore,
    ProfileCredential,
    ProfileUsageStats,
    FailureReason,
} from "./types.js";
import { logger } from "./logger.js";
import { getProvider } from "./providers/index.js";

// ── Store path ──────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORE_PATH = join(__dirname, "..", "data", "auth-store.json");

function getStorePath(): string {
    const p = process.env.SMART_ROUTER_AUTH_STORE ?? DEFAULT_STORE_PATH;
    // logger.info(`[AuthStore] Using path: ${p}`); // Too noisy for every call? Maybe once?
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
        // logger.info(`[AuthStore] Saved to ${path}`);
    } catch (err) {
        logger.error(`[AuthStore] Failed to save auth store to ${path}:`, err);
        throw err; // Re-throw to alert caller
    }
}

// ── Profile CRUD ────────────────────────────────────────────────────

/**
 * Build profile ID from provider + optional label.
 * Examples: "antigravity:personal", "openai:default"
 */
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
    // Reset usage stats on new/updated profile
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

        // Final state logic for display
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

    // From auth store profiles
    for (const cred of Object.values(store.profiles)) {
        providers.add(cred.provider);
    }

    // From environment variables (API key providers)
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

/**
 * Pick the next available profile for a provider using round-robin,
 * skipping profiles in cooldown.
 */
export function pickNextProfile(provider: string, modelId?: string): {
    profileId: string;
    credential: ProfileCredential;
} | null {
    const store = loadStore();
    const now = Date.now();

    // Get all profiles for this provider
    const candidates = Object.entries(store.profiles)
        .filter(([, cred]) => cred.provider === provider)
        .map(([id, cred]) => {
            const stats = store.usageStats[id] ?? {};
            return { id, cred, stats };
        });

    if (candidates.length === 0) return null;

    // Filter out profiles in COOLDOWN or DISABLED
    const available = candidates.filter((c) => {
        const stats = c.stats as ProfileUsageStats;
        if (stats.state === "DISABLED") return false;

        // Global cooldown check
        const until = stats.cooldownUntil ?? 0;
        // If global cooldown is active, return false (unless we want to allow retry for other reasons?)
        if (now < until) return false;

        // Model-specific cooldown check
        if (modelId && stats.modelCooldowns?.[modelId]) {
            if (now < stats.modelCooldowns[modelId]) return false;
        }

        // Model-specific cooldown check
        if (modelId && stats.modelCooldowns?.[modelId]) {
            if (now < stats.modelCooldowns[modelId]) return false;
        }

        // Proactive Rate Limit Check
        const providerDef = getProvider(provider);
        const rpmLimit = providerDef?.rateLimits?.requestsPerMinute;
        if (rpmLimit && stats.rateLimitStats) {
            const { windowStart, requestCount } = stats.rateLimitStats;
            const windowElapsed = now - windowStart;

            // If window expired, we will reset on next increment, so it's effectively available
            // If window active, check count
            if (windowElapsed < 60000 && requestCount >= rpmLimit) {
                return false;
            }
        }

        return true;
    });

    // If all in cooldown, pick the one with soonest expiry (fallback logic)
    // But per user request, we might want to fail hard? 
    // For now, let's return null if NO profile is available for this model.
    if (available.length === 0) {
        return null;
    }

    // Round-robin: pick least recently used
    available.sort((a, b) => (a.stats.lastUsed ?? 0) - (b.stats.lastUsed ?? 0));
    const picked = available[0]!;

    return { profileId: picked.id, credential: picked.cred };
}

/**
 * For API key providers, check env var directly.
 */
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

    // Initialize or reset window if needed
    if (!stats || (now - stats.windowStart) >= 60000) {
        stats = { windowStart: now, requestCount: 0 };
    }

    // Increment
    stats.requestCount++;

    store.usageStats[profileId] = {
        ...existing,
        lastUsed: now, // Also update lastUsed for LRU
        rateLimitStats: stats,
    } as ProfileUsageStats;

    saveStore(store);
}

/**
 * Exponential backoff: DISABLED FOR TESTING
 */
function calculateCooldownMs(errorCount: number): number {
    const sequence = [
        30 * 1000,          // 30s
        60 * 1000,          // 1m
        120 * 1000,         // 2m
        300 * 1000,         // 5m
        600 * 1000,         // 10m
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
    const errorCount = (existing.errorCount ?? 0) + 1;

    // Default cooldown logic
    let cooldownMs = explicitCooldownMs ?? calculateCooldownMs(errorCount);

    // If Antigravity and no explicit cooldown, assume 5 hours for safety
    if (profileId.startsWith("antigravity") && !explicitCooldownMs && reason === "rate_limit") {
        cooldownMs = 5 * 60 * 60 * 1000; // 5 hours
    }

    const cooldownUntil = Date.now() + cooldownMs;

    // Determine new state based on failure reason
    let newState: "COOLDOWN" | "DISABLED" | "ACTIVE" = "COOLDOWN";
    if (reason === "auth" || reason === "billing") {
        newState = "DISABLED";
    }

    // If model-specific rate limit, don't block the whole profile
    const modelCooldowns = existing.modelCooldowns ?? {};
    if ((reason === "rate_limit" || reason === "model_not_found") && modelId) {
        // Keep global state ACTIVE, just block this model
        // Even if it was previously COOLDOWN (stale), we should reset to ACTIVE since we just tried to use it
        newState = existing.state === "DISABLED" ? "DISABLED" : "ACTIVE";
        modelCooldowns[modelId] = cooldownUntil;
    } else if (newState === "COOLDOWN") {
        // Global cooldown (e.g. unknown error or no model specified)
        // Check if we should block everything
    }

    store.usageStats[profileId] = {
        ...existing,
        state: newState,
        errorCount,
        // Only set global cooldown if it's NOT a model-specific rate limit or not found
        cooldownUntil: (newState === "COOLDOWN" && (!modelId || (reason !== "rate_limit" && reason !== "model_not_found"))) ? cooldownUntil : existing.cooldownUntil,
        modelCooldowns,
        lastFailureAt: Date.now(),
        failureReason: reason,
    } as ProfileUsageStats;
    saveStore(store);

    const target = modelId ? `model ${modelId}` : "profile";
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
