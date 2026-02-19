import type { ServerResponse } from "node:http";
import type { RoutingDecision } from "../router/index.js";
import { getProvider } from "../providers/index.js";
import {
    upsertProfile,
    markProfileFailure,
} from "../auth/store.js";
import { recordRequest } from "../storage/stats.js";
import { logger } from "../shared/logger.js";
import type {
    ChatCompletionRequest,
    ChatCompletionResponse,
    ProfileCredential,
    OAuthCredential,
    RequestStats,
} from "../shared/types.js";
import { getTask, calculateCost, doAuditLog } from "./helpers.js";

// Set to true to log raw upstream responses to console
const DEBUG_RAW = process.env.DEBUG_RAW === "1";

// ── Token refresh helper ────────────────────────────────────────────

export async function ensureFreshToken(
    providerId: string,
    profileId: string,
    cred: ProfileCredential
): Promise<ProfileCredential> {
    if (cred.type !== "oauth") return cred;
    const oauth = cred as OAuthCredential;
    if (!oauth.expires || Date.now() < oauth.expires) return cred;

    const provider = getProvider(providerId);
    if (!provider?.refreshToken) return cred;

    try {
        logger.info(`Refreshing token for ${profileId}...`);
        const refreshed = await provider.refreshToken(oauth);
        const label = profileId.split(":")[1] ?? "default";
        upsertProfile(providerId, refreshed, label);
        return refreshed;
    } catch (err) {
        logger.warn(`Token refresh failed for ${profileId}:`, err);
        return cred;
    }
}

// ── Proxy request to upstream ───────────────────────────────────────

export async function proxyToProvider(
    providerId: string,
    profileId: string,
    credential: ProfileCredential,
    body: ChatCompletionRequest,
    isStreaming: boolean,
    res: ServerResponse,
    decision: RoutingDecision
): Promise<void> {
    const provider = getProvider(providerId);
    if (!provider) throw new Error(`Unknown provider: ${providerId}`);

    const cred = await ensureFreshToken(providerId, profileId, credential);
    const headers = provider.getHeaders(cred);
    const formattedBody = provider.formatRequest(body);
    const realModelId = (formattedBody as any).model || body.model || "unknown";

    // Determine base URL (copilot-proxy may have custom)
    let baseUrl = provider.baseUrl;
    if (cred.type === "api_key" && cred.metadata?.baseUrl) {
        baseUrl = cred.metadata.baseUrl;
    }
    if (cred.type === "oauth" && cred.resourceUrl) {
        baseUrl = cred.resourceUrl;
    }

    // Use provider-specific URL if buildUrl is defined, otherwise default
    const modelId = body.model ?? "default";
    const url = provider.buildUrl
        ? provider.buildUrl(baseUrl, modelId)
        : `${baseUrl}/chat/completions`;
    const startTime = Date.now();

    // Stats prep
    const task = getTask(decision);
    const estPromptTokens = Math.ceil(JSON.stringify(body.messages).length / 4);
    const estimatedCostUsd = calculateCost(modelId, estPromptTokens, 0);
    let promptTokens = estPromptTokens;
    let completionTokens = 0;

    // Inject project ID if present (needed for Antigravity)
    if (
        cred.type === "oauth" &&
        cred.projectId &&
        typeof formattedBody === "object" &&
        formattedBody !== null
    ) {
        (formattedBody as any).project = cred.projectId;
    }
    const requestJson = JSON.stringify(formattedBody);

    if (DEBUG_RAW) {
        console.log(
            `\n\x1b[35m━━ REQ ${providerId} ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`
        );
        console.log(`\x1b[35mPOST\x1b[0m ${url}`);
        const safeHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(headers)) {
            if (k.toLowerCase() === "authorization") {
                safeHeaders[k] = v.slice(0, 18) + "...";
            } else {
                safeHeaders[k] = v;
            }
        }
        console.log(`\x1b[90mHeaders:\x1b[0m`);
        for (const [k, v] of Object.entries(safeHeaders)) {
            console.log(`  ${k}: ${v}`);
        }
        try {
            const pretty = JSON.stringify(formattedBody, null, 2);
            const lines = pretty.split("\n");
            console.log(`\x1b[90mBody:\x1b[0m`);
            for (const line of lines.slice(0, 30)) {
                console.log(`  ${line}`);
            }
            if (lines.length > 30) console.log(`  ... (${lines.length} lines total)`);
        } catch {
            console.log(`\x1b[90mBody:\x1b[0m ${requestJson.slice(0, 300)}`);
        }
        console.log(
            `\x1b[35m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m`
        );
    }

    const upstream = await fetch(url, {
        method: "POST",
        headers,
        body: requestJson,
    });

    const contentType = upstream.headers.get("Content-Type") ?? "";
    logger.info(`→ POST ${url} (${upstream.status}) [${contentType}]`);

    if (!upstream.ok) {
        const errText = await upstream.text().catch(() => "");
        const status = upstream.status;

        logger.error(
            `Upstream error ${status} on ${url}: ${errText.slice(0, 1000)}`
        );

        // Determine failure reason
        let reason:
            | "auth"
            | "rate_limit"
            | "billing"
            | "timeout"
            | "format"
            | "model_not_found"
            | "unknown" = "unknown";
        const bodyLower = errText.toLowerCase();

        // 1. Status Code Logic
        if (status === 429) reason = "rate_limit";
        else if (status === 404) reason = "model_not_found";
        else if (status === 401 || status === 403) reason = "auth";
        else if (status === 402) reason = "billing";
        else if (status === 504 || status === 408) reason = "timeout";

        // 2. Body Payload Logic (Deep Inspect)
        if (reason === "unknown" || reason === "rate_limit") {
            const isRateLimit =
                bodyLower.includes("rate_limit") ||
                bodyLower.includes("too many requests") ||
                bodyLower.includes("quota_exceeded") ||
                bodyLower.includes("usage_limit") ||
                bodyLower.includes("limit_exceeded") ||
                bodyLower.includes("reached your current") ||
                bodyLower.includes("exhausted");

            if (isRateLimit) reason = "rate_limit";
            else if (
                bodyLower.includes("not_found") ||
                bodyLower.includes("model not found")
            )
                reason = "model_not_found";
            else if (
                bodyLower.includes("invalid_api_key") ||
                bodyLower.includes("unauthorized") ||
                bodyLower.includes("permission_denied")
            )
                reason = "auth";
            else if (
                bodyLower.includes("billing") ||
                bodyLower.includes("insufficient_balance") ||
                bodyLower.includes("payment_required")
            )
                reason = "billing";
        }

        // 3. Header Detection
        const hasRateLimitHeaders =
            upstream.headers.has("retry-after") ||
            upstream.headers.has("x-ratelimit-reset") ||
            upstream.headers.has("x-ratelimit-reset-requests") ||
            upstream.headers.has("x-ratelimit-reset-tokens");

        if (hasRateLimitHeaders) reason = "rate_limit";

        let explicitCooldownMs: number | undefined;
        if (reason === "rate_limit") {
            const retryAfter = upstream.headers.get("retry-after");
            const resetTime =
                upstream.headers.get("x-ratelimit-reset") ||
                upstream.headers.get("x-ratelimit-reset-requests") ||
                upstream.headers.get("x-ratelimit-reset-tokens");

            if (retryAfter) {
                const seconds = parseInt(retryAfter, 10);
                if (!isNaN(seconds)) {
                    explicitCooldownMs = seconds * 1000;
                } else {
                    const date = new Date(retryAfter);
                    if (!isNaN(date.getTime())) {
                        explicitCooldownMs = Math.max(0, date.getTime() - Date.now());
                    }
                }
            } else if (resetTime) {
                const resetVal = parseFloat(resetTime);
                if (!isNaN(resetVal)) {
                    if (resetVal > 1700000000) {
                        explicitCooldownMs = Math.max(0, resetVal * 1000 - Date.now());
                    } else {
                        explicitCooldownMs = resetVal * 1000;
                    }
                }
            }

            if (explicitCooldownMs) {
                logger.warn(
                    `[LIMIT] Explicit cooldown from headers: ${Math.round(
                        explicitCooldownMs / 1000
                    )}s`
                );
            }
        }

        const failureModelId =
            (reason === "rate_limit" || reason === "model_not_found") &&
                modelId !== "default"
                ? modelId
                : undefined;

        markProfileFailure(profileId, reason, explicitCooldownMs, failureModelId);

        const errStats: RequestStats = {
            timestamp: Date.now(),
            provider: providerId,
            model: modelId,
            realModel: realModelId,
            profileId,
            tier: decision.scoring.tier,
            tierScore: decision.scoring.totalScore,
            task,
            latencyMs: Date.now() - startTime,
            promptTokens: 0,
            completionTokens: 0,
            success: false,
            error: `${status} ${reason}`,
        };
        recordRequest(errStats);
        doAuditLog(errStats);

        let upstreamErrorBody: any;
        try {
            upstreamErrorBody = JSON.parse(errText);
        } catch { }

        throw Object.assign(
            new Error(`${providerId} returned ${status}: ${errText.slice(0, 200)}`),
            {
                status,
                reason,
                cooldownMs: explicitCooldownMs,
                upstreamError: upstreamErrorBody,
            }
        );
    }

    const latencyMs = Date.now() - startTime;

    const isActuallyStreaming =
        contentType.includes("event-stream") || contentType.includes("stream");

    if (isStreaming && upstream.body && isActuallyStreaming) {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Smart-Router-Provider": providerId,
            "X-Smart-Router-Profile": profileId,
        });

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const rawModelId = body.model ?? "unknown";
        const streamModelId =
            providerId === "antigravity" ? `antigravity/${rawModelId}` : rawModelId;

        const needsTransform = !provider.isOpenAICompatible;

        let sseBuffer = "";
        let debugModel = realModelId;

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const text = decoder.decode(value, { stream: true });
                if (process.env.DEBUG_RAW) console.log("RAW STREAM:", text);

                if (!needsTransform) {
                    if (DEBUG_RAW) {
                        process.stdout.write(
                            text.replace(/data: /g, "").replace(/\n\n/g, "")
                        );
                    } else {
                        const dataLines = text
                            .split("\n")
                            .filter((l) => l.startsWith("data:"));
                        for (const line of dataLines) {
                            const data = line.replace(/^data:\s*/, "").trim();
                            if (data === "[DONE]") continue;
                            try {
                                const chunk = JSON.parse(data);
                                if (process.env.DEBUG_RAW)
                                    console.log(
                                        "DEBUG CHUNK:",
                                        JSON.stringify(chunk).slice(0, 100)
                                    );
                                const content =
                                    chunk.choices?.[0]?.delta?.content ||
                                    chunk.choices?.[0]?.text ||
                                    chunk.choices?.[0]?.message?.content ||
                                    chunk.content;
                                if (content) process.stdout.write(content);
                            } catch { }
                        }
                    }
                    res.write(text);
                    continue;
                }

                // Transform provider-specific SSE → OpenAI SSE
                sseBuffer += text.replace(/\r\n/g, "\n");
                let idx = sseBuffer.indexOf("\n\n");
                while (idx !== -1) {
                    const chunk = sseBuffer.slice(0, idx);
                    sseBuffer = sseBuffer.slice(idx + 2);

                    const dataLines = chunk
                        .split("\n")
                        .filter((l: string) => l.startsWith("data:"))
                        .map((l: string) => l.slice(5).trim());

                    for (const data of dataLines) {
                        if (data === "[DONE]") {
                            res.write("data: [DONE]\n\n");
                            continue;
                        }

                        try {
                            const event = JSON.parse(data);

                            const gemCandidates =
                                event.candidates || event.response?.candidates;
                            const gemModelVersion = event.response?.modelVersion;

                            // ── Debug logging ──
                            if (DEBUG_RAW) {
                                const etype =
                                    event.type || (gemCandidates ? "gemini.chunk" : "unknown");
                                if (etype === "response.created" && event.response?.model) {
                                    debugModel = event.response.model;
                                    console.log(
                                        `\x1b[36m[RES]\x1b[0m response.created  model=\x1b[33m${debugModel}\x1b[0m`
                                    );
                                } else if (etype === "response.output_text.delta") {
                                    process.stdout.write(event.delta ?? "");
                                } else if (etype === "response.output_text.done") {
                                    console.log(
                                        `\n\x1b[36m[RES]\x1b[0m \x1b[32m✓ text.done\x1b[0m "${(
                                            event.text ?? ""
                                        ).slice(0, 120)}"`
                                    );
                                } else if (
                                    etype === "response.completed" ||
                                    etype === "response.done"
                                ) {
                                    const m = event.response?.model ?? debugModel;
                                    const u = event.response?.usage;
                                    const tokStr = u
                                        ? `in=${u.input_tokens ?? 0} out=${u.output_tokens ?? 0
                                        } total=${u.total_tokens ?? 0}`
                                        : "";
                                    console.log(
                                        `\x1b[36m[RES]\x1b[0m \x1b[32m✓ completed\x1b[0m model=\x1b[33m${m}\x1b[0m ${tokStr}`
                                    );
                                } else if (gemCandidates) {
                                    if (gemModelVersion) debugModel = gemModelVersion;
                                    const gt =
                                        gemCandidates?.[0]?.content?.parts?.[0]?.text ?? "";
                                    const fin = gemCandidates?.[0]?.finishReason;
                                    const usage = event.response?.usageMetadata;
                                    if (usage) {
                                        if (usage.promptTokenCount)
                                            promptTokens = usage.promptTokenCount;
                                        if (usage.candidatesTokenCount)
                                            completionTokens = usage.candidatesTokenCount;
                                    }
                                    if (gt) process.stdout.write(gt);
                                    if (fin === "STOP") {
                                        const tokStr = usage
                                            ? `in=${usage.promptTokenCount ?? 0} out=${usage.candidatesTokenCount ?? 0
                                            } total=${usage.totalTokenCount ?? 0}`
                                            : "";
                                        console.log(
                                            `\n\x1b[36m[RES]\x1b[0m \x1b[32m✓ finish=${fin}\x1b[0m model=\x1b[33m${debugModel}\x1b[0m ${tokStr}`
                                        );
                                    }
                                } else if (
                                    ![
                                        "response.in_progress",
                                        "response.output_item.added",
                                        "response.output_item.done",
                                        "response.content_part.added",
                                        "response.content_part.done",
                                    ].includes(etype)
                                ) {
                                    console.log(
                                        `\x1b[36m[RES]\x1b[0m \x1b[90m${etype}\x1b[0m ${JSON.stringify(
                                            event
                                        ).slice(0, 300)}`
                                    );
                                }
                            }

                            // ── Codex Responses API format ──
                            if (event.type === "response.output_text.delta" && event.delta) {
                                const openAIChunk = {
                                    id: `chatcmpl-${Date.now()}`,
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: streamModelId,
                                    choices: [
                                        {
                                            index: 0,
                                            delta: { content: event.delta },
                                            finish_reason: null,
                                        },
                                    ],
                                };
                                res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
                            }

                            if (
                                event.type === "response.completed" ||
                                event.type === "response.done"
                            ) {
                                const finalChunk = {
                                    id: `chatcmpl-${Date.now()}`,
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: streamModelId,
                                    choices: [
                                        {
                                            index: 0,
                                            delta: {},
                                            finish_reason: "stop",
                                        },
                                    ],
                                    usage: event.response?.usage
                                        ? {
                                            prompt_tokens: event.response.usage.input_tokens ?? 0,
                                            completion_tokens:
                                                event.response.usage.output_tokens ?? 0,
                                            total_tokens: event.response.usage.total_tokens ?? 0,
                                        }
                                        : undefined,
                                };
                                res.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
                                res.write("data: [DONE]\n\n");
                            }

                            // ── Gemini SSE format ──
                            if (gemCandidates) {
                                for (const cand of gemCandidates) {
                                    const parts = cand.content?.parts ?? [];
                                    const textContent = parts
                                        .filter((p: any) => p.text && !p.thoughtSignature)
                                        .map((p: any) => p.text)
                                        .join("");
                                    if (textContent) {
                                        if (!DEBUG_RAW) process.stdout.write(textContent);
                                        const openAIChunk = {
                                            id: `chatcmpl-${Date.now()}`,
                                            object: "chat.completion.chunk",
                                            created: Math.floor(Date.now() / 1000),
                                            model: streamModelId,
                                            choices: [
                                                {
                                                    index: 0,
                                                    delta: { content: textContent },
                                                    finish_reason:
                                                        cand.finishReason === "STOP" ? "stop" : null,
                                                },
                                            ],
                                        };
                                        res.write(`data: ${JSON.stringify(openAIChunk)}\n\n`);
                                    }
                                    if (cand.finishReason === "STOP") {
                                        res.write("data: [DONE]\n\n");
                                    }
                                }
                            }

                            // ── Error events ──
                            if (
                                event.type === "error" ||
                                event.type === "response.failed" ||
                                event.error
                            ) {
                                const msg =
                                    event.message ||
                                    event.error?.message ||
                                    event.response?.error?.message ||
                                    "Unknown error";
                                const errorChunk = {
                                    id: `chatcmpl-${Date.now()}`,
                                    object: "chat.completion.chunk",
                                    created: Math.floor(Date.now() / 1000),
                                    model: streamModelId,
                                    choices: [
                                        {
                                            index: 0,
                                            delta: { content: `\n\n[Error: ${msg}]` },
                                            finish_reason: "stop",
                                        },
                                    ],
                                };
                                res.write(`data: ${JSON.stringify(errorChunk)}\n\n`);
                                res.write("data: [DONE]\n\n");
                            }
                        } catch {
                            // Ignore unparseable lines
                        }
                    }
                    idx = sseBuffer.indexOf("\n\n");
                }
            }
        } finally {
            res.end();
        }

        const stats: RequestStats = {
            timestamp: Date.now(),
            provider: providerId,
            model: modelId,
            realModel: debugModel,
            profileId,
            tier: decision.scoring.tier,
            tierScore: decision.scoring.totalScore,
            task,
            latencyMs: Date.now() - startTime,
            promptTokens,
            completionTokens,
            estimatedCostUsd,
            actualCostUsd: calculateCost(modelId, promptTokens, completionTokens),
            success: true,
        };
        recordRequest(stats);
        doAuditLog(stats);
    } else {
        const responseText = await upstream.text();

        if (DEBUG_RAW) {
            console.log(`\x1b[36m[RAW ${providerId}]\x1b[0m Non-streaming response:`);
            console.log(responseText.slice(0, 1000));
        }

        let parsed: ChatCompletionResponse;
        try {
            const raw = JSON.parse(responseText);
            parsed = provider.formatResponse
                ? provider.formatResponse(raw, body.model)
                : raw;
        } catch {
            if (provider.formatResponse) {
                try {
                    parsed = provider.formatResponse(responseText, body.model);
                } catch {
                    parsed = {
                        id: "",
                        object: "chat.completion",
                        created: 0,
                        model: "",
                        choices: [],
                    };
                }
            } else {
                parsed = {
                    id: "",
                    object: "chat.completion",
                    created: 0,
                    model: "",
                    choices: [],
                };
            }
        }

        // Inject routing metadata
        const pTokens = parsed.usage?.prompt_tokens ?? promptTokens;
        const cTokens = parsed.usage?.completion_tokens ?? completionTokens;
        const actualCost = calculateCost(parsed.model ?? modelId, pTokens, cTokens);

        parsed._routing = {
            tier: decision.scoring.tier,
            provider: providerId,
            model: parsed.model ?? body.model ?? "unknown",
            score: decision.scoring.totalScore,
            profileId,
        };

        res.writeHead(200, {
            "Content-Type": "application/json",
            "X-Smart-Router-Provider": providerId,
            "X-Smart-Router-Profile": profileId,
            "X-Smart-Router-Tier": decision.scoring.tier,
            "X-Smart-Router-Score": decision.scoring.totalScore.toString(),
            "X-Smart-Router-Reason": (decision as any).reason ?? "auto",
        });
        res.end(JSON.stringify(parsed));
        if (DEBUG_RAW) {
            console.log(
                `[Proxy] Response: ${decision.selectedProvider}/${decision.selectedModel}`
            );
            console.log(
                `[Proxy] Routing Tier: ${decision.scoring.tier}, Score: ${decision.scoring.totalScore}`
            );
        }

        const stats: RequestStats = {
            timestamp: Date.now(),
            provider: providerId,
            model: parsed.model ?? body.model ?? "unknown",
            realModel: parsed.model ?? realModelId,
            profileId,
            tier: decision.scoring.tier,
            tierScore: decision.scoring.totalScore,
            task,
            latencyMs,
            promptTokens: pTokens,
            completionTokens: cTokens,
            estimatedCostUsd,
            actualCostUsd: actualCost,
            success: true,
        };
        recordRequest(stats);
        doAuditLog(stats);
    }
}
