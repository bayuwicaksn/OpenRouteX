import {
  createServer,
  IncomingMessage,
  ServerResponse,
  Server,
} from "node:http";
import { readFileSync, existsSync } from "node:fs";
import * as fs from "node:fs"; // Add this for fs.statSync
import { join } from "node:path";
import { route } from "./router/index.js";
import type { RoutingDecision } from "./router/index.js";
import { getProvider, getAccountId, getAccountEmail } from "./providers/index.js";
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
} from "./auth-store.js";
import { getAllModels } from "./models.js";
import { exec } from "node:child_process";
import type { LoginContext } from "./types.js";

import { logger } from "./logger.js";
import { recordRequest, getStats, getStatsSummary } from "./stats.js";
import { getModelsForProvider, findModel } from "./models.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ProfileCredential,
  OAuthCredential,
  RequestStats,
} from "./types.js";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import { generateKey, listKeys, revokeKey, validateKey } from "./api-keys.js";

const JWT_SECRET = process.env.SMART_ROUTER_JWT_SECRET || "smart-router-secret-key-change-me";
const ADMIN_PASSWORD = process.env.SMART_ROUTER_ADMIN_PASSWORD || "admin";

const DEFAULT_PORT = 3402;

// ── Request body parsing ────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// ── Token refresh helper ────────────────────────────────────────────

async function ensureFreshToken(
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

// Set to true to log raw upstream responses to console
const DEBUG_RAW = process.env.DEBUG_RAW === "1";

// ── Formatting Helpers ──────────────────────────────────────────────

function formatDuration(ms: number): string {
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

function formatGoogleStyle429(model: string, waitMs: number) {
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

function getTask(decision: RoutingDecision): string {
  const top = [...decision.scoring.dimensions].sort(
    (a, b) => b.score - a.score
  )[0];
  return top && top.score > 0 ? top.dimension : "general";
}

function calculateCost(
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

function doAuditLog(stats: RequestStats) {
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

// ── Proxy request to upstream ───────────────────────────────────────

async function proxyToProvider(
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
    // Show headers (mask auth token)
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
    // Pretty-print body
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

    // Determine failure reason (Wajib Akurat)
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
    else if (status === 404)
      reason = "model_not_found"; // New: Isolation for model errors
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

    // 3. Header Detection (Wajib Akurat)
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
          // Could be a date string
          const date = new Date(retryAfter);
          if (!isNaN(date.getTime())) {
            explicitCooldownMs = Math.max(0, date.getTime() - Date.now());
          }
        }
      } else if (resetTime) {
        const resetVal = parseFloat(resetTime);
        if (!isNaN(resetVal)) {
          // Some APIs use Unix timestamp, some use seconds remaining
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

    // If it's a model-specific rate limit (429) or not found (404), we only block that model
    // Otherwise (auth, billing, etc), we might block the whole profile (modelId undefined)
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
    const modelId =
      providerId === "antigravity" ? `antigravity/${rawModelId}` : rawModelId;

    // Check if this provider needs SSE format transformation
    const needsTransform = !provider.isOpenAICompatible;

    let sseBuffer = "";

    let debugModel = realModelId; // track actual model from SSE events

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value, { stream: true });
        if (process.env.DEBUG_RAW) console.log("RAW STREAM:", text);

        if (!needsTransform) {
          // Native OpenAI format — pass through
          if (DEBUG_RAW) {
            process.stdout.write(
              text.replace(/data: /g, "").replace(/\n\n/g, "")
            );
          } else {
            // Clean console chat log for OpenAI-compatible providers
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
        // Normalize \r\n → \n (Gemini uses \r\n\r\n as delimiter)
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

              // Resolve Gemini candidates — could be event.candidates or event.response.candidates
              const gemCandidates =
                event.candidates || event.response?.candidates;
              const gemModelVersion = event.response?.modelVersion;

              // ── Debug logging (uses buffered JSON — reliable) ──
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
                  model: modelId,
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
                  model: modelId,
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

              // ── Gemini SSE format (handles both event.candidates and event.response.candidates) ──
              if (gemCandidates) {
                for (const cand of gemCandidates) {
                  const parts = cand.content?.parts ?? [];
                  // Filter out thought parts (have thoughtSignature)
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
                      model: modelId,
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
                  model: modelId,
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
      // Use provider's formatResponse if available (e.g. Gemini → OpenAI conversion)
      parsed = provider.formatResponse
        ? provider.formatResponse(raw, body.model)
        : raw;
    } catch {
      // If JSON parse fails, maybe the provider can handle the raw text (e.g. SSE aggregation)
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

// ── Main request handler ────────────────────────────────────────────

async function handleChatCompletion(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const bodyStr = await readBody(req);
  const body = JSON.parse(bodyStr) as ChatCompletionRequest;

  // ── Authentication Check ──────────────────────────────────────────

  // Check Authorization header for Bearer sk-sr-...
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
  } else {
    // For now, if no key is provided, we might allow it (dev mode) or block it.
    // Requirements say "Client API Keys". Let's enforce it if the user enabled it?
    // Or just log it. For now, let's allow anonymous for backward compatibility 
    // BUT log a warning, OR strict mode? 
    // The user asked for "Client API Keys" to track usage.
    // Let's NOT block existing users yet, unless we want to enforce it.
    // Better approach: If header is present, validate it. If not, treat as "anonymous".
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

  // Check if user explicitly requested a specific model
  // Check if user explicitly requested a specific model (and it's not "auto")
  const requestedModel = body.model;
  const isAuto =
    !requestedModel ||
    requestedModel === "auto" ||
    requestedModel.includes("/auto");

  let decision: RoutingDecision;
  let explicitModel: ReturnType<typeof findModel> = undefined;

  // Declare providersToTry here so it's available in all scopes
  let providersToTry: Array<{ provider: string; model: string }>;

  if (!isAuto && requestedModel) {
    explicitModel = findModel(requestedModel);
  }

  // Determine streaming
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

  // If user explicitly requested a model but it's not found, return 404 without fallback
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
    // FAST PATH: User explicitly requested a valid model
    // Create a dummy decision for logging/stats (mocking a "routing" result)
    decision = {
      selectedProvider: explicitModel.provider,
      selectedModel: explicitModel.id, // Use internal ID
      fallbackChain: [],
      reason: "EXPLICIT", // Added reason property
      scoring: {
        tier: "SIMPLE", // Default tier for explicit
        totalScore: 0,
        confidence: 1,
        // userIntent: "explicit", // Removed: Not in ScoringResult type
        dimensions: [],
      },
    };

    logger.route(`EXPLICIT → ${explicitModel.provider}/${explicitModel.id}`);

    // Ensure we use the internal ID for the provider
    body.model = explicitModel.id;

    providersToTry = [
      { provider: explicitModel.provider, model: explicitModel.id },
    ];
  } else {
    // SLOW PATH: Use router logic for "auto" or fallback
    decision = route(prompt, availableProviders);

    // Log detailed scoring reasons
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
    // Add fallbacks
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
    // Restrict attempts to the forced provider only
    providersToTry = [
      {
        provider: targetProvider,
        model: explicitModel ? explicitModel.id : decision.selectedModel,
      },
    ];
    forcedCredential = cred;
  }

  const maxWait = 5; // seconds
  let lastError: any = null;
  let successful = false;

  // Try providers in order
  for (const { provider: providerId, model } of providersToTry) {
    // Get credential for this provider
    // Get credential for this provider
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
        // Try API key from env
        const apiKey = getApiKeyForProvider(providerId);
        if (!apiKey) continue;
        profileId = buildProfileId(providerId, "env");
        credential = { type: "api_key", provider: providerId, key: apiKey };
      }
    }

    try {
      // Create a copy of the body with the specific model for this attempt
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
      // Pass raw error body if available
      // If explicit model requested and rate limited, passing modelId ensures model-specific cooldown
      // If rate limited, cooldown ONLY this specific model
      const failureModelId =
        reason === "rate_limit" || reason === "model_not_found"
          ? model
          : undefined;
      markProfileFailure(profileId, reason, err.cooldownMs, failureModelId);

      // Store raw upstream error for detailed reporting if needed
      if (
        err.upstreamError &&
        providerId === "antigravity" &&
        model === "gemini-3-pro-high"
      ) {
        (decision as any)._lastAntigravityError = err.upstreamError;
      }

      // Check if there are more providers to try
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
    // Check cooldowns for all profiles involved in the chain
    for (const id in store.profiles) {
      if (id.startsWith(provider)) {
        const s = store.usageStats[id];
        if (s) {
          // Check global cooldown
          let wait = (s.cooldownUntil ?? 0) - Date.now();

          // Check model-specific cooldown if applicable
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

  // Reuse previously declared variable
  // const requestedModel = body.model || decision.selectedModel;
  const finalModel = body.model || decision.selectedModel;
  const isTargetModel = finalModel.includes("gemini-3-pro-high");

  if (useAntigravityStyle) {
    // If Antigravity (or similar) is explicitly cooling down, prefer its style
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
    // Generic or other provider error
    // If we have a maxCooldown > 0, it means we hit a rate limit
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

// ── Route handlers ──────────────────────────────────────────────────

async function handleModels(
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
        pricing: m.pricing, // Added pricing info
        context_window: m.contextWindow, // Added context window
      });
    }
  }
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ object: "list", data: models }));
}

async function handleHealth(
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

// ── Dashboard Handlers ──────────────────────────────────────────────

// ── Static Handler ──────────────────────────────────────────────
async function handleStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || "", `http://${req.headers.host}`);
  let filePath = join(process.cwd(), "client", "dist", ...url.pathname.split("/").filter(p => p));

  // Default to index.html for root
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
    // SPA Fallback: serve index.html for unknown non-API routes
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

async function handleApiStats(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const stats = getStats();
  const summary = getStatsSummary();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({
    summary,
    requests: stats.requests.slice(-100) // Return last 100 for recent activity
  }));
}

async function handleApiConfig(
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

async function handleDeleteProfile(
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

async function handleAddProfile(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = await readBody(req);
    const data = JSON.parse(body);
    const { provider, label, apiKey } = data;

    // For API Key providers, label is required. For OAuth (like openai-codex), we can derive it.
    const isOAuth = provider === "antigravity" || provider === "openai-codex";

    if (!provider || (!label && !isOAuth) || (!apiKey && !isOAuth)) {
      // Note: for OAuth, 'apiKey' might be the token passed in directly, or empty if doing flow?
      // Actually in handleAuthLogin (which calls this?), wait.
      // This function 'handleAddProfile' seems to be for the manual "Save Account" button which sends JSON.
      // But the user is using "Connect Account" button which calls /auth/login.

      // Let's check handleAuthLogin in src/proxy.ts instead.
      // Wait, the previous view_file was 1400-1480.
      // handleAuthLogin is likely focused on the "Connect" flow.
      // Let's look at handleAuthLogin first before editing this.

      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing required fields" }));
      return;
    }

    if (!getProvider(provider)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid provider ID" }));
      return;
    }

    // Upsert the profile
    if (provider === "antigravity") {
      // Treat input key as refresh token for OAuth
      upsertProfile(
        provider,
        {
          type: "oauth",
          provider,
          access: "",
          refresh: apiKey,
          expires: 0, // Force immediate refresh
        },
        label
      );
    } else if (provider === "openai-codex") {
      // Validate and treat input as Access Token for OpenAI Codex
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
          expires: Date.now() + 10 * 24 * 60 * 60 * 1000, // Assume 10 days
          accountId,
          email: getAccountEmail(apiKey) ?? undefined,
        },
        label
      );
    } else {
      // Standard API Key
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

async function handleApiKeys(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url || "", `http://${req.headers.host}`);

  if (req.method === "GET") {
    // List keys
    const keys = listKeys();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ keys }));
  } else if (req.method === "POST") {
    // Generate key
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
    // Revoke key
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

async function handleAuthLogin(
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

    // Set headers for streaming response
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    });

    const ctx = createServerLoginContext(res);

    try {
      const cred = await provider.login(ctx, { projectId });

      // Auto-detect email for label if not provided or if default
      let effectiveLabel = label;
      if ("email" in cred && cred.email) {
        effectiveLabel = cred.email;
      } else if (!effectiveLabel || effectiveLabel === "default") {
        effectiveLabel = "default";
      }

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

// ── Auth Middleware ─────────────────────────────────────────────────

function requireDashboardAuth(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  // Allow if password is not set (dev mode) - or force it?
  // Let's enforce it if SMART_ROUTER_ADMIN_PASSWORD is set, otherwise default to "admin"

  const cookies = parseCookies(req);
  const token = cookies["smart-router-auth"];

  if (!token) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return false;
  }

  try {
    jwt.verify(token, JWT_SECRET);
    return true;
  } catch (err) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid token" }));
    return false;
  }
}

function parseCookies(req: IncomingMessage): Record<string, string> {
  const list: Record<string, string> = {};
  const rc = req.headers.cookie;

  rc && rc.split(';').forEach(function (cookie) {
    const parts = cookie.split('=');
    list[parts.shift()!.trim()] = decodeURI(parts.join('='));
  });

  return list;
}

async function handleDashboardLogin(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  try {
    const body = await readBody(req);
    const { password } = JSON.parse(body);

    if (password !== ADMIN_PASSWORD) {
      setTimeout(() => { // Delay to prevent timing attacks
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid password" }));
      }, 500);
      return;
    }

    const token = jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "7d" });

    // Set HttpOnly cookie
    const cookieOptions = [
      `smart-router-auth=${token}`,
      "HttpOnly",
      "Path=/",
      "SameSite=Strict",
      "Max-Age=604800" // 7 days
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

async function handleDashboardLogout(
  _req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  res.writeHead(200, {
    "Content-Type": "application/json",
    "Set-Cookie": "smart-router-auth=; HttpOnly; Path=/; Max-Age=0"
  });
  res.end(JSON.stringify({ success: true }));
}

async function handleAuthStatus(
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

// ── Server ──────────────────────────────────────────────────────────

export function startProxy(port?: number): Server {
  const p = port ?? Number(process.env.SMART_ROUTER_PORT) ?? DEFAULT_PORT;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${p}`);

    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
        await handleChatCompletion(req, res);
      } else if (url.pathname === "/v1/models" && req.method === "GET") {
        await handleModels(req, res);
      } else if (url.pathname === "/health" && req.method === "GET") {
        await handleHealth(req, res);
      } else if (url.pathname.startsWith("/api/")) {
        // API Routes
        if (url.pathname === "/api/auth/dashboard-login" && req.method === "POST") {
          await handleDashboardLogin(req, res);
        } else if (url.pathname === "/api/auth/logout" && req.method === "POST") {
          await handleDashboardLogout(req, res);
        } else if (url.pathname === "/api/auth/status" && req.method === "GET") {
          await handleAuthStatus(req, res);
        } else if (url.pathname === "/api/stats") {
          if (requireDashboardAuth(req, res)) await handleApiStats(req, res);
        } else if (url.pathname === "/api/config") {
          if (requireDashboardAuth(req, res)) await handleApiConfig(req, res);
        } else if (url.pathname === "/api/profile" && req.method === "POST") {
          if (requireDashboardAuth(req, res)) await handleAddProfile(req, res);
        } else if (url.pathname === "/api/profile" && req.method === "DELETE") {
          if (requireDashboardAuth(req, res)) await handleDeleteProfile(req, res);
        } else if (url.pathname === "/api/keys") {
          if (requireDashboardAuth(req, res)) await handleApiKeys(req, res);
        } else if (url.pathname === "/api/auth/login" && req.method === "POST") {
          // This is for Antigravity login flow - arguably should be protected too, 
          // but maybe we want to allow it? Let's protect it to be safe.
          if (requireDashboardAuth(req, res)) await handleAuthLogin(req, res);
        } else {
          res.writeHead(404, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "API endpoint not found" } }));
        }
      } else {
        // Static files & SPA fallback
        await handleStatic(req, res);
      }
    } catch (err: any) {
      logger.error("Request error:", err?.message ?? err);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Internal error" } }));
      }
    }
  });

  server.listen(p, () => {
    const address = server.address();
    logger.ok(`OpenRouteX proxy listening on http://localhost:${p}`);
    logger.info(`Providers: ${getAvailableProviders().size} configured`);
    logger.info(
      `Profiles: ${Object.keys(loadStore().profiles).length} accounts`
    );
    logger.info(`\nEndpoints:`);
    logger.info(`  POST /v1/chat/completions  — OpenAI-compatible`);
    logger.info(`  GET  /v1/models            — List providers`);
    logger.info(`  GET  /health               — Health check`);
    logger.info(`  GET  /dashboard            — Dashboard UI`);
  });

  return server;
}
