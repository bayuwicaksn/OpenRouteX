import type { IncomingMessage } from "node:http";
import type { RoutingDecision } from "../router/index.js";
import type { RequestStats } from "../shared/types.js";
import { findModel } from "../models/registry.js";
import { logger } from "../shared/logger.js";

// ── Request body parsing ────────────────────────────────────────────

export function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", () => resolve(Buffer.concat(chunks).toString()));
        req.on("error", reject);
    });
}

// ── Formatting Helpers ──────────────────────────────────────────────

export function formatDuration(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    let parts = [];
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join("");
}

export function formatGoogleStyle429(model: string, waitMs: number) {
    const durationStr = formatDuration(waitMs);
    const waitSeconds = Math.ceil(waitMs / 1000);
    const resetTimestamp = new Date(Date.now() + waitMs).toISOString();

    return {
        error: {
            code: 429,
            message: `You have exhausted your capacity on this model. Your quota will reset after ${durationStr}.`,
            status: "RESOURCE_EXHAUSTED",
            details: [
                {
                    "@type": "type.googleapis.com/google.rpc.ErrorInfo",
                    reason: "QUOTA_EXHAUSTED",
                    domain: "cloudcode-pa.googleapis.com",
                    metadata: {
                        uiMessage: "true",
                        model: model,
                        quotaResetDelay: `${durationStr}.${(waitMs % 1000)
                            .toString()
                            .padStart(3, "0")}s`,
                        quotaResetTimeStamp: resetTimestamp,
                    },
                },
                {
                    "@type": "type.googleapis.com/google.rpc.RetryInfo",
                    retryDelay: `${waitSeconds}.${(waitMs % 1000)
                        .toString()
                        .padStart(3, "0")}s`,
                },
            ],
        },
    };
}

// ── Auditing Helpers ────────────────────────────────────────────────

export function getTask(decision: RoutingDecision): string {
    const top = [...decision.scoring.dimensions].sort(
        (a, b) => b.score - a.score
    )[0];
    return top && top.score > 0 ? top.dimension : "general";
}

export function calculateCost(
    modelId: string,
    promptTokens: number,
    completionTokens: number
): number {
    const model = findModel(modelId);
    if (!model || !model.pricing) return 0;
    return (
        (promptTokens * model.pricing.input +
            completionTokens * model.pricing.output) /
        1000000
    );
}

export function doAuditLog(stats: RequestStats) {
    const costStr = `$${(stats.actualCostUsd ?? 0).toFixed(6)}`;
    const estStr = `$${(stats.estimatedCostUsd ?? 0).toFixed(6)}`;
    const modelDisplay =
        stats.realModel && stats.realModel !== stats.model
            ? `\x1b[36m${stats.model}\x1b[0m \x1b[90m→ ${stats.realModel}\x1b[0m`
            : `\x1b[36m${stats.model}\x1b[0m`;

    logger.audit(
        `Task: \x1b[33m${stats.task}\x1b[0m | ` +
        `Model: ${modelDisplay} | ` +
        `Reason: \x1b[90m${stats.tier}\x1b[0m (${stats.tierScore.toFixed(
            1
        )}) | ` +
        `Cost: ${costStr} (est: ${estStr}) | ` +
        `Acc: ${stats.profileId} | ` +
        `Status: ${stats.success ? "\x1b[32mOK\x1b[0m" : "\x1b[31mERR\x1b[0m"}${stats.error ? ` (${stats.error})` : ""
        }`
    );
}

// ── Cookie Parser ───────────────────────────────────────────────────

export function parseCookies(req: IncomingMessage): Record<string, string> {
    const list: Record<string, string> = {};
    const rc = req.headers.cookie;

    rc && rc.split(';').forEach(function (cookie) {
        const parts = cookie.split('=');
        list[parts.shift()!.trim()] = decodeURI(parts.join('='));
    });

    return list;
}
