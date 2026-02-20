import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import * as fs from "node:fs";
import { join } from "node:path";
import { exec } from "node:child_process";
import jwt from "jsonwebtoken";

import { route } from "../router/index.js";
import type { RoutingDecision } from "../router/index.js";
import { getProvider, getAccountId, getAccountEmail } from "../providers/index.js";
import {
    getAvailableProviders,
    pickNextProfile,
    getApiKeyForProvider,
    incrementProfileUsage,
    markProfileFailure,
    loadStore,
    upsertProfile,
    buildProfileId,
    listAllProfiles,
    removeProfile,
} from "../auth/store.js";
import { getAllModels, getModelsForProvider, findModel } from "../models/registry.js";
import { logger } from "../shared/logger.js";
import { recordRequest, getStats, getStatsSummary } from "../storage/stats.js";
import { generateKey, listKeys, revokeKey, validateKey } from "../auth/api-keys.js";
import type {
    ChatCompletionRequest,
    ProfileCredential,
    RequestStats,
    LoginContext,
} from "../shared/types.js";

import { proxyToProvider } from "./proxy-upstream.js";
import { readBody, getTask, formatGoogleStyle429, doAuditLog, parseCookies } from "./helpers.js";
import { requireDashboardAuth, JWT_SECRET } from "./middleware.js";

const ADMIN_PASSWORD = process.env.SMART_ROUTER_ADMIN_PASSWORD || "admin";
const DEBUG_RAW = process.env.DEBUG_RAW === "1";

// ── Chat Completion Handler ─────────────────────────────────────────

export async function handleChatCompletion(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    const bodyStr = await readBody(req);
    const body = JSON.parse(bodyStr) as ChatCompletionRequest;

    // ── Authentication Check ──
    const authHeader = req.headers.authorization;
    let clientLabel = "anonymous";

    if (authHeader && authHeader.startsWith("Bearer sk-sr-")) {
        const key = authHeader.slice(7);
        const validKey = validateKey(key);

        if (!validKey) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: { message: "Invalid API Key", code: "invalid_api_key" } }));
            return;
        }
        clientLabel = validKey.label || validKey.prefix;
    }

    // Extract prompt for routing
    const lastUserMsg = [...body.messages]
        .reverse()
        .find((m) => m.role === "user");
    const prompt = lastUserMsg?.content ?? "";

    // Determine available providers
    const availableProviders = getAvailableProviders();

    if (availableProviders.size === 0) {
        res.writeHead(503, { "Content-Type": "application/json" });
        res.end(
            JSON.stringify({
                error: {
                    message:
                        "No providers configured. Run: smart-router login <provider>",
                },
            })
        );
        return;
    }

    const requestedModel = body.model;
    const isAuto =
        !requestedModel ||
        requestedModel === "auto" ||
        requestedModel.includes("/auto");

    let decision: RoutingDecision;
    let explicitModel: ReturnType<typeof findModel> = undefined;
    let providersToTry: Array<{ provider: string; model: string }>;

    if (!isAuto && requestedModel) {
        explicitModel = findModel(requestedModel);
    }

    const isStreaming = body.stream === true;

    if (DEBUG_RAW) {
        console.log("Routing Debug:");
        console.log("  Requested:", requestedModel);
        console.log("  Is Auto:", isAuto);
        console.log(
            "  Explicit Model Found:",
            explicitModel ? explicitModel.id : "null"
        );
        if (explicitModel) {
            console.log(
                "  Provider Available:",
                availableProviders.has(explicitModel.provider)
            );
        }
    }

    // If user explicitly requested a model but it's not found, return 404
    if (!isAuto && requestedModel && !explicitModel) {
        const errMsg = `Model not found: ${requestedModel}`;
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
            JSON.stringify({ error: { code: "model_not_found", message: errMsg } })
        );
        const stats: RequestStats = {
            timestamp: Date.now(),
            provider: "router",
            model: requestedModel,
            profileId: "none",
            tier: "EXPLICIT",
            tierScore: 0,
            task: "general",
            latencyMs: 0,
            promptTokens: 0,
            completionTokens: 0,
            success: false,
            error: errMsg,
        };
        recordRequest(stats);
        doAuditLog(stats);
        return;
    }

    if (explicitModel && availableProviders.has(explicitModel.provider)) {
        decision = {
            selectedProvider: explicitModel.provider,
            selectedModel: explicitModel.id,
            fallbackChain: [],
            reason: "EXPLICIT",
            scoring: {
                tier: "SIMPLE",
                totalScore: 0,
                confidence: 1,
                dimensions: [],
            },
        };

        logger.route(`EXPLICIT → ${explicitModel.provider}/${explicitModel.id}`);
        body.model = explicitModel.id;

        providersToTry = [
            { provider: explicitModel.provider, model: explicitModel.id },
        ];
    } else {
        decision = route(prompt, availableProviders);

        const reasons = decision.scoring.dimensions
            .filter((d) => d.score > 0)
            .map(
                (d) =>
                    `\x1b[90m${d.dimension}\x1b[0m=${d.score.toFixed(
                        1
                    )} [${d.matchedKeywords.join(",")}]`
            );

        if (reasons.length > 0) {
            logger.route(
                `Scoring: ${reasons.slice(0, 3).join(" | ")}${reasons.length > 3 ? " ..." : ""
                }`
            );
        }

        providersToTry = [];
        if (decision.selectedProvider !== "none") {
            providersToTry.push({
                provider: decision.selectedProvider,
                model: decision.selectedModel,
            });
        }
        providersToTry.push(...decision.fallbackChain);
    }

    // Optional: force a specific auth profile via header or body flag
    const forcedProfileId =
        (req.headers["x-smart-router-profile"] as string | undefined) ||
        (typeof (body as any).profile === "string"
            ? (body as any).profile
            : undefined) ||
        (typeof (body as any).profile_id === "string"
            ? (body as any).profile_id
            : undefined);

    let forcedCredential: ProfileCredential | undefined;
    if (forcedProfileId) {
        const store = loadStore();
        const cred = store.profiles[forcedProfileId];
        if (!cred) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify({
                    error: {
                        code: "profile_not_found",
                        message: `Profile not found: ${forcedProfileId}`,
                    },
                })
            );
            return;
        }
        const targetProvider = explicitModel
            ? explicitModel.provider
            : decision.selectedProvider;
        if (cred.provider !== targetProvider) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(
                JSON.stringify({
                    error: {
                        code: "profile_provider_mismatch",
                        message: `Profile ${forcedProfileId} belongs to ${cred.provider}, but target provider is ${targetProvider}`,
                    },
                })
            );
            return;
        }
        providersToTry = [
            {
                provider: targetProvider,
                model: explicitModel ? explicitModel.id : decision.selectedModel,
            },
        ];
        forcedCredential = cred;
    }

    const maxWait = 5;
    let lastError: any = null;
    let successful = false;

    // Try providers in order
    for (const { provider: providerId, model } of providersToTry) {
        let profileId: string;
        let credential: ProfileCredential;

        if (forcedCredential) {
            profileId = forcedProfileId!;
            credential = forcedCredential;
        } else {
            const profile = pickNextProfile(providerId, model);
            if (profile) {
                profileId = profile.profileId;
                credential = profile.credential;
            } else {
                const apiKey = getApiKeyForProvider(providerId);
                if (!apiKey) continue;
                profileId = buildProfileId(providerId, "env");
                credential = { type: "api_key", provider: providerId, key: apiKey };
            }
        }

        try {
            const attemptBody = { ...body, model };
            await proxyToProvider(
                providerId,
                profileId,
                credential,
                attemptBody,
                isStreaming,
                res,
                decision
            );
            incrementProfileUsage(profileId, providerId);
            return;
        } catch (err: any) {
            const reason = err?.reason ?? "unknown";
            // NOTE: Do NOT call markProfileFailure here.
            // It is already called inside proxyToProvider (proxy-upstream.ts)
            // before throwing. Calling it again would double the errorCount
            // and escalate cooldowns twice as fast.

            if (
                err.upstreamError &&
                providerId === "antigravity" &&
                model === "gemini-3-pro-high"
            ) {
                (decision as any)._lastAntigravityError = err.upstreamError;
            }

            const currentIndex = providersToTry.findIndex(
                (p) => p.provider === providerId && p.model === model
            );
            if (currentIndex < providersToTry.length - 1) {
                logger.warn(`${providerId} (${profileId}) failed, trying next...`);
            }
        }
    }

    // All providers failed
    let maxCooldown = 0;
    let antigravityMaxCooldown = 0;
    let antigravityModel = "";

    const store = loadStore();
    for (const { provider, model } of providersToTry) {
        for (const id in store.profiles) {
            if (id.startsWith(provider)) {
                const s = store.usageStats[id];
                if (s) {
                    let wait = (s.cooldownUntil ?? 0) - Date.now();

                    if (wait <= 0 && model && s.modelCooldowns?.[model]) {
                        wait = s.modelCooldowns[model] - Date.now();
                    }

                    if (wait > maxCooldown) maxCooldown = wait;

                    if (provider === "antigravity" && wait > antigravityMaxCooldown) {
                        antigravityMaxCooldown = wait;
                        antigravityModel = model;
                    }
                }
            }
        }
    }

    const waitSeconds = Math.ceil(maxCooldown / 1000);
    const useAntigravityStyle = antigravityMaxCooldown > 0;

    const errorMsg =
        maxCooldown > 0
            ? `Service Unavailable: Rate limit reached. All models are in COOLDOWN. Please wait ${waitSeconds}s before retrying.`
            : "Service Unavailable: All available models are currently in COOLDOWN or reached their RATE LIMIT. Please wait or check your provider status.";

    logger.error(`\x1b[31mCRITICAL\x1b[0m: ${errorMsg}`);

    const finalStats: RequestStats = {
        timestamp: Date.now(),
        provider: "router",
        model: body.model || decision.selectedModel,
        profileId: "none",
        tier: decision.scoring.tier,
        tierScore: decision.scoring.totalScore,
        task: getTask(decision),
        latencyMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        success: false,
        error: errorMsg,
    };
    recordRequest(finalStats);
    doAuditLog(finalStats);

    const finalModel = body.model || decision.selectedModel;

    if (useAntigravityStyle) {
        const agWaitSeconds = Math.ceil(antigravityMaxCooldown / 1000);
        res.writeHead(429, {
            "Content-Type": "application/json",
            "Retry-After": agWaitSeconds.toString(),
        });

        const rawError = (decision as any)._lastAntigravityError;
        if (rawError) {
            res.end(JSON.stringify(rawError));
        } else {
            res.end(
                JSON.stringify(
                    formatGoogleStyle429(
                        antigravityModel || finalModel,
                        antigravityMaxCooldown
                    )
                )
            );
        }
    } else {
        if (maxCooldown > 0) {
            res.writeHead(429, {
                "Content-Type": "application/json",
                "Retry-After": waitSeconds.toString(),
            });
            res.end(
                JSON.stringify({
                    error: {
                        message: errorMsg,
                        type: "rate_limit_exceeded",
                        code: 429,
                        retry_after: waitSeconds,
                    },
                })
            );
        } else {
            res.writeHead(503, {
                "Content-Type": "application/json",
                "Retry-After": "5",
            });
            res.end(
                JSON.stringify({
                    error: {
                        message:
                            "Service Unavailable: No providers available or all failed.",
                        type: "service_unavailable",
                        code: 503,
                    },
                })
            );
        }
    }
}

// ── Models Handler ──────────────────────────────────────────────────

export async function handleModels(
    _req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    const availableProviders = getAvailableProviders();
    const models = [];
    for (const providerId of availableProviders) {
        const providerModels = getModelsForProvider(providerId);
        for (const m of providerModels) {
            models.push({
                id: m.publicId || m.id,
                object: "model",
                created: 0,
                owned_by: m.provider,
                name: m.name,
                capabilities: m.capabilities,
                free: m.free,
                pricing: m.pricing,
                context_window: m.contextWindow,
            });
        }
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ object: "list", data: models }));
}

// ── Health Handler ──────────────────────────────────────────────────

export async function handleHealth(
    _req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    const available = getAvailableProviders();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
        JSON.stringify({
            status: "ok",
            providers: available.size,
            profiles: Object.keys(loadStore().profiles).length,
        })
    );
}

// ── Static Handler ──────────────────────────────────────────────────

export async function handleStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    let filePath = join(process.cwd(), "client", "dist", ...url.pathname.split("/").filter(p => p));

    if (url.pathname === "/") {
        filePath = join(process.cwd(), "client", "dist", "index.html");
    }

    if (existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
        const ext = filePath.split(".").pop()?.toLowerCase();
        const mimeTypes: Record<string, string> = {
            "html": "text/html",
            "js": "application/javascript",
            "css": "text/css",
            "svg": "image/svg+xml",
            "png": "image/png",
            "json": "application/json",
            "ico": "image/x-icon"
        };
        const contentType = mimeTypes[ext || ""] || "application/octet-stream";

        res.writeHead(200, { "Content-Type": contentType });
        res.write(readFileSync(filePath));
        res.end();
    } else {
        const index = join(process.cwd(), "client", "dist", "index.html");
        if (existsSync(index)) {
            res.writeHead(200, { "Content-Type": "text/html" });
            res.write(readFileSync(index));
            res.end();
        } else {
            res.writeHead(404);
            res.end("Not found. Run npm run build in client/ directory.");
        }
    }
}

// ── API Stats Handler ───────────────────────────────────────────────

export async function handleApiStats(
    _req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    const stats = getStats();
    const summary = getStatsSummary();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
        summary,
        requests: stats.requests.slice(-100)
    }));
}

// ── API Config Handler ──────────────────────────────────────────────

export async function handleApiConfig(
    _req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    const providers = Array.from(getAvailableProviders()).map((id) => {
        const p = getProvider(id);
        return {
            id: p?.id,
            name: p?.name,
            baseUrl: p?.baseUrl,
            rateLimits: p?.rateLimits,
        };
    });

    const profiles = listAllProfiles();
    const models = getAllModels();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ providers, profiles, models }));
}

// ── Profile Handlers ────────────────────────────────────────────────

export async function handleDeleteProfile(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const url = new URL(req.url || "", `http://${req.headers.host}`);
        const id = url.searchParams.get("id");

        if (!id) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing profile ID" }));
            return;
        }

        const success = removeProfile(id);
        if (success) {
            logger.info(`Deleted profile: ${id}`);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true }));
        } else {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Profile not found" }));
        }
    } catch (err: any) {
        logger.error("Failed to delete profile:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
    }
}

export async function handleAddProfile(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const body = await readBody(req);
        const data = JSON.parse(body);
        const { provider, label, apiKey } = data;

        const isOAuth = provider === "antigravity" || provider === "openai-codex";

        if (!provider || (!label && !isOAuth) || (!apiKey && !isOAuth)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing required fields" }));
            return;
        }

        if (!getProvider(provider)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid provider ID" }));
            return;
        }

        if (provider === "antigravity") {
            upsertProfile(
                provider,
                {
                    type: "oauth",
                    provider,
                    access: "",
                    refresh: apiKey,
                    expires: 0,
                },
                label
            );
        } else if (provider === "openai-codex") {
            const accountId = getAccountId(apiKey);
            if (!accountId) {
                throw new Error("Invalid OpenAI Codex Access Token: Could not extract account ID");
            }

            upsertProfile(
                provider,
                {
                    type: "oauth",
                    provider,
                    access: apiKey,
                    refresh: "",
                    expires: Date.now() + 10 * 24 * 60 * 60 * 1000,
                    accountId,
                    email: getAccountEmail(apiKey) ?? undefined,
                },
                label
            );
        } else {
            upsertProfile(provider, { type: "api_key", provider, key: apiKey }, label);
        }

        logger.info(`Added new profile: ${provider}:${label}`);

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
        logger.error("Failed to add profile:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
    }
}

// ── API Keys Handler ────────────────────────────────────────────────

export async function handleApiKeys(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    const url = new URL(req.url || "", `http://${req.headers.host}`);

    if (req.method === "GET") {
        const keys = listKeys();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ keys }));
    } else if (req.method === "POST") {
        const body = await readBody(req);
        const { label } = JSON.parse(body);
        if (!label) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Label is required" }));
            return;
        }
        const newKey = generateKey(label);
        logger.info(`Generated new API key: ${label} (${newKey.prefix})`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(newKey));
    } else if (req.method === "DELETE") {
        const hash = url.searchParams.get("hash");
        if (!hash) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Hash is required" }));
            return;
        }
        revokeKey(hash);
        logger.info(`Revoked API key hash: ${hash.slice(0, 8)}...`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
    } else {
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Method not allowed" }));
    }
}

// ── Server Login Context ────────────────────────────────────────────

function createServerLoginContext(res?: ServerResponse): LoginContext {
    return {
        async openUrl(url: string) {
            if (res) {
                logger.info(`[Auth] Opening URL: ${url}`);
                res.write(`data: ${JSON.stringify({ action: "open_url", url })}\n\n`);
                return;
            }

            const cmd =
                process.platform === "win32"
                    ? `start "" "${url}"`
                    : process.platform === "darwin"
                        ? `open "${url}"`
                        : `xdg-open "${url}"`;
            exec(cmd);
        },
        log: (msg: string) => {
            logger.info(msg);
            if (res) res.write(`data: ${JSON.stringify({ action: "log", message: msg })}\n\n`);
        },
        async note(message: string, title?: string) {
            if (title) logger.info(`[${title}] ${message}`);
            else logger.info(message);
            if (res) res.write(`data: ${JSON.stringify({ action: "log", message: message })}\n\n`);
        },
        async prompt(_message: string): Promise<string> {
            throw new Error("Prompt not supported in server mode");
        },
        progress: {
            update: (msg: string) => {
                logger.info(`Progress: ${msg}`);
                if (res) res.write(`data: ${JSON.stringify({ action: "progress", message: msg })}\n\n`);
            },
            stop: (msg?: string) => {
                logger.info(`Done: ${msg}`);
                if (res && msg) res.write(`data: ${JSON.stringify({ action: "progress", message: msg })}\n\n`);
            },
        },
        isRemote: false,
    };
}

// ── Auth Login Handler ──────────────────────────────────────────────

export async function handleAuthLogin(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const body = await readBody(req);
        const data = JSON.parse(body);
        const { provider: providerId, label, projectId } = data;

        if (!providerId) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Missing provider ID" }));
            return;
        }

        const provider = getProvider(providerId);
        if (!provider) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Invalid provider ID" }));
            return;
        }

        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        });

        const ctx = createServerLoginContext(res);

        try {
            const cred = await provider.login(ctx, { projectId });

            let effectiveLabel = label;
            if ("email" in cred && cred.email) {
                effectiveLabel = cred.email;
            } else if (!effectiveLabel || effectiveLabel === "default") {
                effectiveLabel = "default";
            }

            logger.info(`[Auth] Saving profile for ${providerId} (${effectiveLabel})`);
            upsertProfile(providerId, cred, effectiveLabel);

            res.write(`data: ${JSON.stringify({ success: true, profile: { id: providerId, label: effectiveLabel } })}\n\n`);
        } catch (loginErr: any) {
            res.write(`data: ${JSON.stringify({ error: loginErr.message })}\n\n`);
        }

        res.end();
    } catch (err: any) {
        logger.error("Auth login failed:", err);
        if (!res.headersSent) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: err.message }));
        } else {
            res.end();
        }
    }
}

// ── Dashboard Auth Handlers ─────────────────────────────────────────

export async function handleDashboardLogin(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        const body = await readBody(req);
        const { password } = JSON.parse(body);

        if (password !== ADMIN_PASSWORD) {
            setTimeout(() => {
                res.writeHead(401, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: "Invalid password" }));
            }, 500);
            return;
        }

        const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "7d" });

        const cookieOptions = [
            `smart-router-auth=${token}`,
            "HttpOnly",
            "Path=/",
            "SameSite=Strict",
            "Max-Age=604800"
        ];

        if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] === "https") {
            cookieOptions.push("Secure");
        }

        res.writeHead(200, {
            "Content-Type": "application/json",
            "Set-Cookie": cookieOptions.join("; ")
        });
        res.end(JSON.stringify({ success: true }));
    } catch (err: any) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
    }
}

export async function handleDashboardLogout(
    _req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    res.writeHead(200, {
        "Content-Type": "application/json",
        "Set-Cookie": "smart-router-auth=; HttpOnly; Path=/; Max-Age=0"
    });
    res.end(JSON.stringify({ success: true }));
}

export async function handleAuthStatus(
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    const cookies = parseCookies(req);
    const token = cookies["smart-router-auth"];

    if (!token) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ authenticated: false }));
        return;
    }

    try {
        jwt.verify(token, JWT_SECRET);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ authenticated: true }));
    } catch {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ authenticated: false }));
    }
}
