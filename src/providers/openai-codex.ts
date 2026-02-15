import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { platform, release, arch } from "node:os";
import type {
    Provider,
    ChatCompletionRequest,
    ChatCompletionResponse,
    ProfileCredential,
    OAuthCredential,
    LoginContext,
} from "../types.js";

// ── OpenAI Codex OAuth constants (from pi-ai) ──────────────────────

const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const REDIRECT_URI = "http://localhost:1455/auth/callback";
const SCOPE = "openid profile email offline_access";
const JWT_CLAIM_PATH = "https://api.openai.com/auth";

// Codex uses chatgpt.com backend, NOT api.openai.com
const CODEX_BASE_URL = "https://chatgpt.com/backend-api";

// ── PKCE ────────────────────────────────────────────────────────────

function generatePkce() {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
}

function createState() {
    return randomBytes(16).toString("hex");
}

// ── JWT decode ──────────────────────────────────────────────────────

function decodeJwt(token: string): Record<string, unknown> | null {
    try {
        const parts = token.split(".");
        if (parts.length !== 3) return null;
        const decoded = Buffer.from(parts[1]!, "base64url").toString();
        return JSON.parse(decoded);
    } catch { return null; }
}

function getAccountId(accessToken: string): string | null {
    const payload = decodeJwt(accessToken);
    const auth = payload?.[JWT_CLAIM_PATH] as { chatgpt_account_id?: string } | undefined;
    const id = auth?.chatgpt_account_id;
    return typeof id === "string" && id.length > 0 ? id : null;
}

// ── Local callback server ───────────────────────────────────────────

function startCallbackServer(expectedState: string): Promise<{
    close: () => void;
    waitForCode: () => Promise<{ code: string } | null>;
}> {
    return new Promise((resolve) => {
        let lastCode: string | null = null;
        const server = createServer((req, res) => {
            const url = new URL(req.url ?? "", "http://localhost");
            if (url.pathname !== "/auth/callback") {
                res.statusCode = 404;
                res.end("Not found");
                return;
            }
            if (url.searchParams.get("state") !== expectedState) {
                res.statusCode = 400;
                res.end("State mismatch");
                return;
            }
            const code = url.searchParams.get("code");
            if (!code) {
                res.statusCode = 400;
                res.end("Missing code");
                return;
            }
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.end("<!doctype html><html><body><p>Authentication successful. Return to terminal.</p></body></html>");
            lastCode = code;
        });

        server.listen(1455, "127.0.0.1", () => {
            resolve({
                close: () => { try { server.close(); } catch { /* ignore */ } },
                waitForCode: async () => {
                    for (let i = 0; i < 600; i++) {
                        if (lastCode) return { code: lastCode };
                        await new Promise((r) => setTimeout(r, 500));
                    }
                    return null;
                },
            });
        });

        server.on("error", () => {
            resolve({
                close: () => { try { server.close(); } catch { /* ignore */ } },
                waitForCode: async () => null,
            });
        });
    });
}

// ── Token exchange ──────────────────────────────────────────────────

async function exchangeCode(code: string, verifier: string): Promise<OAuthCredential> {
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: CLIENT_ID,
            code,
            code_verifier: verifier,
            redirect_uri: REDIRECT_URI,
        }),
    });

    if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);

    const data = (await res.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
    };

    if (!data.access_token || !data.refresh_token) {
        throw new Error("Token response missing fields");
    }

    const accountId = getAccountId(data.access_token);
    if (!accountId) throw new Error("Failed to extract accountId from JWT");

    return {
        type: "oauth",
        provider: "openai-codex",
        access: data.access_token,
        refresh: data.refresh_token,
        expires: Date.now() + data.expires_in * 1000,
        accountId,
    };
}

// ── Token refresh ───────────────────────────────────────────────────

async function refreshToken(cred: OAuthCredential): Promise<OAuthCredential> {
    const res = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: cred.refresh,
            client_id: CLIENT_ID,
        }),
    });

    if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);

    const data = (await res.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
    };

    const accountId = getAccountId(data.access_token);

    return {
        ...cred,
        access: data.access_token,
        refresh: data.refresh_token ?? cred.refresh,
        expires: Date.now() + data.expires_in * 1000,
        accountId: accountId ?? cred.accountId,
    };
}

// ── Convert OpenAI Chat Completions → Codex Responses API format ────

function chatToCodexBody(body: ChatCompletionRequest): unknown {
    // Extract system prompt from messages
    const systemMsgs = body.messages.filter((m) => m.role === "system");
    const nonSystemMsgs = body.messages.filter((m) => m.role !== "system");
    const instructions = systemMsgs.map((m) => m.content).join("\n") || undefined;

    // Convert messages to Responses API input format
    const input = nonSystemMsgs.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: String(m.content ?? ""),
    }));

    const codexBody: Record<string, unknown> = {
        model: body.model,
        store: false,
        stream: true,  // Codex API always streams
        instructions: instructions ?? "You are a helpful assistant.",
        input,
    };

    return codexBody;
}

// ── Parse SSE response from Codex Responses API → OpenAI format ─────

function codexResponsesToOpenAI(raw: unknown, model: string): ChatCompletionResponse {
    // Handle SSE stream text (aggregate chunks)
    if (typeof raw === "string") {
        const lines = raw.split("\n");
        const textParts: string[] = [];
        let finishReason = "stop";
        let usage = { input: 0, output: 0, total: 0 };

        for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const dataStr = line.slice(6).trim();
            if (dataStr === "[DONE]") continue;

            try {
                const event = JSON.parse(dataStr);
                const type = event.type;

                // Content delta events
                if (type === "response.output_text.delta") {
                    if (event.delta) textParts.push(event.delta);
                }

                // Response completed — extract usage
                if (type === "response.completed" || type === "response.done") {
                    const resp = event.response;
                    if (resp?.usage) {
                        usage = {
                            input: resp.usage.input_tokens ?? 0,
                            output: resp.usage.output_tokens ?? 0,
                            total: resp.usage.total_tokens ?? 0,
                        };
                    }
                    if (resp?.status === "incomplete") {
                        finishReason = "length";
                    }
                }

                // Error events
                if (type === "error" || type === "response.failed") {
                    const msg = event.message || event.response?.error?.message || "Unknown error";
                    return {
                        id: `codex-${Date.now()}`,
                        object: "chat.completion",
                        created: Math.floor(Date.now() / 1000),
                        model,
                        choices: [{
                            index: 0,
                            message: { role: "assistant", content: `Error: ${msg}` },
                            finish_reason: "stop",
                        }],
                    };
                }
            } catch {
                // ignore parse errors on individual lines
            }
        }

        return {
            id: `codex-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1000),
            model,
            choices: [{
                index: 0,
                message: { role: "assistant", content: textParts.join("") },
                finish_reason: finishReason,
            }],
            usage: {
                prompt_tokens: usage.input,
                completion_tokens: usage.output,
                total_tokens: usage.total,
            },
        };
    }

    // Shouldn't get here, but handle JSON objects too
    if (typeof raw === "object" && raw !== null) {
        const obj = raw as any;
        // If it's already OpenAI format, return as-is
        if (obj.choices) return obj;
    }

    return {
        id: `codex-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model,
        choices: [],
    };
}

// ── Provider export ─────────────────────────────────────────────────

export const openaiCodexProvider: Provider = {
    id: "openai-codex",
    name: "OpenAI Codex (ChatGPT OAuth)",
    baseUrl: CODEX_BASE_URL,
    supportsStreaming: true,

    async login(ctx: LoginContext): Promise<ProfileCredential> {
        const { verifier, challenge } = generatePkce();
        const state = createState();
        const params = new URLSearchParams({
            response_type: "code",
            client_id: CLIENT_ID,
            redirect_uri: REDIRECT_URI,
            scope: SCOPE,
            code_challenge: challenge,
            code_challenge_method: "S256",
            state,
            id_token_add_organizations: "true",
            codex_cli_simplified_flow: "true",
            originator: "smart-router",
        });

        const authUrl = `${AUTHORIZE_URL}?${params.toString()}`;

        await ctx.note(
            "Browser will open for OpenAI authentication.\n" +
            "Sign in with your ChatGPT account.\n" +
            "OAuth uses localhost:1455 for the callback.",
            "OpenAI Codex OAuth",
        );

        const server = await startCallbackServer(state);
        try {
            await ctx.openUrl(authUrl);
        } catch {
            ctx.log(`\nOpen this URL:\n\n${authUrl}\n`);
        }

        ctx.progress.update("Waiting for browser sign-in...");
        const result = await server.waitForCode();
        server.close();

        let code: string;
        if (result?.code) {
            code = result.code;
        } else {
            const input = await ctx.prompt("Paste the redirect URL or authorization code:");
            try {
                const url = new URL(input.trim());
                code = url.searchParams.get("code") ?? input.trim();
            } catch {
                code = input.trim();
            }
        }

        ctx.progress.update("Exchanging tokens...");
        return exchangeCode(code, verifier);
    },

    getHeaders(cred: ProfileCredential): Record<string, string> {
        const token = cred.type === "oauth" ? cred.access : "";
        const accountId = cred.type === "oauth" ? (cred as OAuthCredential).accountId ?? "" : "";
        const userAgent = `pi (${platform()} ${release()}; ${arch()})`;

        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "chatgpt-account-id": accountId,
            "OpenAI-Beta": "responses=experimental",
            "originator": "pi",
            "User-Agent": userAgent,
            "Accept": "text/event-stream",
        };
    },

    buildUrl(baseUrl: string, _modelId: string): string {
        const normalized = baseUrl.replace(/\/+$/, "");
        if (normalized.endsWith("/codex/responses")) return normalized;
        if (normalized.endsWith("/codex")) return `${normalized}/responses`;
        return `${normalized}/codex/responses`;
    },

    formatRequest(body: ChatCompletionRequest): unknown {
        return chatToCodexBody(body);
    },

    formatResponse(raw: unknown, requestModelId?: string): ChatCompletionResponse {
        const model = typeof raw === "object" && raw !== null && "model" in raw
            ? String((raw as any).model)
            : (requestModelId ? `openai-codex/${requestModelId}` : "codex");
        return codexResponsesToOpenAI(raw, model);
    },

    refreshToken,
};
