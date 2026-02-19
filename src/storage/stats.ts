import { db } from "./db.js";
import type { RequestStats } from "../shared/types.js";

type StatsSummary = {
    totalRequests: number;
    totalTokens: number;
    providerBreakdown: Record<string, number>;
    avgLatencyMs: number;
    successRate: number;
};

export function recordRequest(req: RequestStats): void {
    const insert = db.prepare(`
        INSERT INTO requests (
            timestamp, provider, model, profile_id, tier, tier_score, task,
            latency_ms, prompt_tokens, completion_tokens, success, error_msg
        ) VALUES (
            @timestamp, @provider, @model, @profileId, @tier, @tierScore, @task,
            @latencyMs, @promptTokens, @completionTokens, @success, @error
        )
    `);

    insert.run({
        ...req,
        success: req.success ? 1 : 0,
        error: req.error || null,
        tierScore: req.tierScore || 0,
        tier: req.tier || "unknown",
        task: req.task || "unknown"
    });
}

export function getStats(): { requests: RequestStats[] } {
    // Return last 100 requests for the activity log
    const rows = db.prepare(`
        SELECT * FROM requests 
        ORDER BY timestamp DESC 
        LIMIT 100
    `).all() as any[];

    const requests: RequestStats[] = rows.map(row => ({
        timestamp: row.timestamp,
        provider: row.provider,
        model: row.model,
        profileId: row.profile_id,
        tier: row.tier,
        tierScore: row.tier_score,
        task: row.task,
        latencyMs: row.latency_ms,
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
        success: row.success === 1,
        error: row.error_msg
    }));

    return { requests };
}

export function getStatsSummary(): StatsSummary {
    const totalRequests = db.prepare("SELECT COUNT(*) as count FROM requests").get() as { count: number };
    const totalTokens = db.prepare("SELECT SUM(prompt_tokens + completion_tokens) as total FROM requests").get() as { total: number };
    const avgLatency = db.prepare("SELECT AVG(latency_ms) as avg FROM requests").get() as { avg: number };
    const successCount = db.prepare("SELECT COUNT(*) as count FROM requests WHERE success = 1").get() as { count: number };

    // Provider breakdown
    const breakdown = db.prepare("SELECT provider, COUNT(*) as count FROM requests GROUP BY provider").all() as { provider: string, count: number }[];
    const providerMap: Record<string, number> = {};
    for (const b of breakdown) {
        providerMap[b.provider] = b.count;
    }

    return {
        totalRequests: totalRequests.count,
        totalTokens: totalTokens.total || 0,
        providerBreakdown: providerMap,
        avgLatencyMs: Math.round(avgLatency.avg || 0),
        successRate: totalRequests.count > 0 ? successCount.count / totalRequests.count : 1,
    };
}
