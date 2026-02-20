import { createHash, randomBytes, randomUUID } from "node:crypto";
import type {
    Provider,
    ChatCompletionRequest,
    ProfileCredential,
    OAuthCredential,
    LoginContext,
} from "../shared/types.js";

// ── Qwen OAuth constants (from openclaw qwen-portal-auth) ──────────

const BASE_URL = "https://chat.qwen.ai";
const DEVICE_CODE_ENDPOINT = `${BASE_URL}/api/v1/oauth2/device/code`;
const TOKEN_ENDPOINT = `${BASE_URL}/api/v1/oauth2/token`;

const CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
const SCOPE = "openid profile email model.completion";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

// ── PKCE ────────────────────────────────────────────────────────────

function generatePkce() {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
}

function toFormUrlEncoded(data: Record<string, string>): string {
    return Object.entries(data)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
}

// ── Device code flow ────────────────────────────────────────────────

type DeviceAuthorization = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    verification_uri_complete?: string;
    expires_in: number;
    interval?: number;
};

async function requestDeviceCode(challenge: string): Promise<DeviceAuthorization> {
    const res = await fetch(DEVICE_CODE_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            "x-request-id": randomUUID(),
        },
        body: toFormUrlEncoded({
            client_id: CLIENT_ID,
            scope: SCOPE,
            code_challenge: challenge,
            code_challenge_method: "S256",
        }),
    });

    if (!res.ok) throw new Error(`Qwen device code failed: ${await res.text()}`);

    const data = (await res.json()) as DeviceAuthorization & { error?: string };
    if (!data.device_code || !data.user_code) {
        throw new Error(data.error ?? "Incomplete device code response");
    }
    return data;
}

async function pollForToken(
    deviceCode: string,
    verifier: string,
): Promise<OAuthCredential | null> {
    const res = await fetch(TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
        },
        body: toFormUrlEncoded({
            grant_type: GRANT_TYPE,
            client_id: CLIENT_ID,
            device_code: deviceCode,
            code_verifier: verifier,
        }),
    });

    if (!res.ok) {
        let payload: { error?: string } | undefined;
        try { payload = (await res.json()) as { error?: string }; } catch { /* ignore */ }
        if (payload?.error === "authorization_pending" || payload?.error === "slow_down") {
            return null; // keep polling
        }
        throw new Error(`Qwen OAuth failed: ${payload?.error ?? res.statusText}`);
    }

    const data = (await res.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        resource_url?: string;
        id_token?: string;  // OpenID Connect if scope includes 'openid'
    };

    if (!data.access_token || !data.refresh_token || !data.expires_in) {
        throw new Error("Incomplete token response");
    }

    // Log full token response keys for debugging
    if (process.env.DEBUG_RAW) {
        console.log("[Qwen] Token response keys:", Object.keys(data));
        if (data.id_token) console.log("[Qwen] id_token present!");
    }

    let resUrl = data.resource_url;
    if (resUrl) {
        if (!resUrl.startsWith("http")) resUrl = `https://${resUrl}`;
        if (resUrl.includes("qwen.ai") && !resUrl.endsWith("/v1")) {
            resUrl = resUrl.replace(/\/+$/, "") + "/v1";
        }
    }

    let email: string | undefined;

    // 1. Try id_token (OpenID Connect — most reliable if present)
    if (data.id_token) {
        try {
            const parts = data.id_token.split(".");
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
                if (process.env.DEBUG_RAW) console.log("[Qwen] id_token payload:", JSON.stringify(payload));
                email = payload.email ?? payload.preferred_username ?? payload.name;
            }
        } catch { /* ignore */ }
    }

    // 2. Try access_token JWT decode
    if (!email) {
        try {
            const parts = data.access_token.split(".");
            if (parts.length === 3) {
                const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
                if (process.env.DEBUG_RAW) console.log("[Qwen] access_token payload:", JSON.stringify(payload));
                email = payload.email ?? payload.preferred_username ?? payload.sub;
            }
        } catch { /* ignore */ }
    }

    // 3. Try user info endpoints (multiple possible paths)
    if (!email) {
        const USER_INFO_URLS = [
            `${BASE_URL}/api/v1/users/profile`,
            `${BASE_URL}/api/v1/users/me`,
            `${BASE_URL}/api/v1/userinfo`,
        ];
        for (const url of USER_INFO_URLS) {
            try {
                const userRes = await fetch(url, {
                    headers: {
                        Authorization: `Bearer ${data.access_token}`,
                        Accept: "application/json",
                    }
                });
                if (process.env.DEBUG_RAW) {
                    console.log(`[Qwen] ${url} => ${userRes.status}`);
                }
                if (userRes.ok) {
                    const raw = await userRes.text();
                    if (process.env.DEBUG_RAW) console.log(`[Qwen] userinfo body:`, raw.slice(0, 500));
                    try {
                        const userData = JSON.parse(raw) as Record<string, any>;
                        email = userData.email ?? userData.data?.email ?? userData.name ??
                            userData.data?.name ?? userData.nickname ?? userData.data?.nickname;
                        if (email) break;
                    } catch { /* not json */ }
                }
            } catch { /* ignore network errors */ }
        }
    }

    if (process.env.DEBUG_RAW) {
        console.log("[Qwen] Resolved email/label:", email ?? "(none)");
    }

    return {
        type: "oauth",
        provider: "qwen-portal",
        access: data.access_token,
        refresh: data.refresh_token,
        expires: Date.now() + data.expires_in * 1000,
        resourceUrl: resUrl,
        email,
    };
}

// ── Provider export ─────────────────────────────────────────────────

export const qwenPortalProvider: Provider = {
    id: "qwen-portal",
    name: "Qwen Portal (Free)",
    baseUrl: "https://portal.qwen.ai/v1",
    supportsStreaming: true,
    isOpenAICompatible: true,

    async login(ctx: LoginContext): Promise<ProfileCredential> {
        const { verifier, challenge } = generatePkce();
        const device = await requestDeviceCode(challenge);
        const verificationUrl = device.verification_uri_complete ?? device.verification_uri;

        await ctx.note(
            `Open ${verificationUrl} to approve access.\nCode: ${device.user_code}`,
            "Qwen OAuth",
        );

        try { await ctx.openUrl(verificationUrl); } catch { /* manual */ }

        let pollInterval = device.interval ? device.interval * 1000 : 2000;
        const deadline = Date.now() + device.expires_in * 1000;

        while (Date.now() < deadline) {
            ctx.progress.update("Waiting for Qwen approval…");
            const result = await pollForToken(device.device_code, verifier);
            if (result) return result;
            await new Promise((r) => setTimeout(r, pollInterval));
            pollInterval = Math.min(pollInterval * 1.2, 10000);
        }

        throw new Error("Qwen OAuth timed out");
    },

    getHeaders(cred: ProfileCredential): Record<string, string> {
        const token = cred.type === "oauth" ? cred.access : "";
        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
    },

    formatRequest(body: ChatCompletionRequest): unknown {
        return body; // OpenAI-compatible
    },
};
