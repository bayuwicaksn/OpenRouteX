import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
    Provider,
    ChatCompletionRequest,
    ProfileCredential,
    OAuthCredential,
    LoginContext,
} from "../shared/types.js";

// ── MiniMax OAuth constants (from openclaw minimax-portal-auth) ─────

type Region = "cn" | "global";

const CONFIG = {
    cn: { baseUrl: "https://api.minimaxi.com", clientId: "78257093-7e40-4613-99e0-527b14b39113" },
    global: { baseUrl: "https://api.minimax.io", clientId: "78257093-7e40-4613-99e0-527b14b39113" },
} as const;

const SCOPE = "group_id profile model.completion";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:user_code";

function toFormUrlEncoded(data: Record<string, string>): string {
    return Object.entries(data).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
}

function generatePkce() {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const state = randomBytes(16).toString("base64url");
    return { verifier, challenge, state };
}

type OAuthCode = {
    user_code: string;
    verification_uri: string;
    expired_in: number;
    interval?: number;
    state: string;
};

async function requestCode(challenge: string, state: string, region: Region): Promise<OAuthCode> {
    const cfg = CONFIG[region];
    const res = await fetch(`${cfg.baseUrl}/oauth/code`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "x-request-id": randomUUID() },
        body: toFormUrlEncoded({
            response_type: "code",
            client_id: cfg.clientId,
            scope: SCOPE,
            code_challenge: challenge,
            code_challenge_method: "S256",
            state,
        }),
    });
    if (!res.ok) throw new Error(`MiniMax auth failed: ${await res.text()}`);
    const data = (await res.json()) as OAuthCode & { error?: string };
    if (!data.user_code || !data.verification_uri) throw new Error(data.error ?? "Incomplete response");
    if (data.state !== state) throw new Error("State mismatch");
    return data;
}

function createMiniMaxProvider(region: Region): Provider {
    const cfg = CONFIG[region];
    const providerId = region === "global" ? "minimax-portal" : "minimax-portal-cn";
    return {
        id: providerId,
        name: `MiniMax Portal (${region === "global" ? "Global" : "China"})`,
        baseUrl: `${cfg.baseUrl}/v1/text/chatcompletion_v2`,
        supportsStreaming: true,
        isOpenAICompatible: true,
        buildUrl(baseUrl: string): string {
            return baseUrl;
        },

        async login(ctx: LoginContext): Promise<ProfileCredential> {
            const { verifier, challenge, state } = generatePkce();
            const oauth = await requestCode(challenge, state, region);

            await ctx.note(
                `Open ${oauth.verification_uri} to approve.\nCode: ${oauth.user_code}`,
                "MiniMax OAuth",
            );
            try { await ctx.openUrl(oauth.verification_uri); } catch { /* manual */ }

            let interval = oauth.interval ?? 2000;
            const deadline = oauth.expired_in;

            while (Date.now() < deadline) {
                ctx.progress.update("Waiting for MiniMax approval…");
                const result = await pollToken(oauth.user_code, verifier, region);
                if (result) return result;
                await new Promise((r) => setTimeout(r, interval));
                interval = Math.min(interval * 1.5, 10000);
            }

            throw new Error("MiniMax OAuth timed out");
        },

        getHeaders(cred: ProfileCredential): Record<string, string> {
            const token = cred.type === "oauth" ? cred.access : "";
            return {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
                "MM-API-Source": "OpenClaw",
            };
        },

        formatRequest(body: ChatCompletionRequest): unknown {
            return body;
        },
    };
}

async function pollToken(userCode: string, verifier: string, region: Region): Promise<OAuthCredential | null> {
    const cfg = CONFIG[region];
    const res = await fetch(`${cfg.baseUrl}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: toFormUrlEncoded({
            grant_type: GRANT_TYPE,
            client_id: cfg.clientId,
            user_code: userCode,
            code_verifier: verifier,
        }),
    });

    const text = await res.text();
    let payload: any;
    try { payload = JSON.parse(text); } catch { return null; }

    if (!res.ok || payload?.status === "error") return null;
    if (payload?.status !== "success") return null;

    if (!payload.access_token || !payload.refresh_token || !payload.expired_in) {
        throw new Error("Incomplete MiniMax token");
    }

    let resUrl = payload.resource_url;
    if (resUrl) {
        if (!resUrl.startsWith("http")) resUrl = `https://${resUrl}`;
        // Map anthropic proxy URLs back to standard v1 for OpenAI compatibility
        if (resUrl.includes("/anthropic")) {
            resUrl = resUrl.replace("/anthropic", "");
        }
        if (!resUrl.endsWith("/v1/text/chatcompletion_v2")) {
            resUrl = resUrl.replace(/\/+$/, "").replace(/\/v1$/, "") + "/v1/text/chatcompletion_v2";
        }
    }

    return {
        type: "oauth",
        provider: region === "global" ? "minimax-portal" : "minimax-portal-cn",
        access: payload.access_token,
        refresh: payload.refresh_token,
        expires: payload.expired_in,
        resourceUrl: resUrl,
    };
}

export const minimaxPortalProvider = createMiniMaxProvider("global");
export const minimaxPortalCNProvider = createMiniMaxProvider("cn");
