import type {
    Provider,
    ChatCompletionRequest,
    ProfileCredential,
    LoginContext,
} from "../types.js";

// ── GitHub Copilot device code (from openclaw github-copilot-auth) ──

const CLIENT_ID = "Iv1.b507a08c87ecfe98";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";

type DeviceCodeResponse = {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in: number;
    interval: number;
};

async function requestDeviceCode(): Promise<DeviceCodeResponse> {
    const res = await fetch(DEVICE_CODE_URL, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: CLIENT_ID, scope: "read:user" }),
    });
    if (!res.ok) throw new Error(`GitHub device code failed: ${res.status}`);
    const data = (await res.json()) as DeviceCodeResponse;
    if (!data.device_code || !data.user_code) throw new Error("Incomplete device code response");
    return data;
}

async function pollForToken(deviceCode: string, intervalMs: number, expiresAt: number): Promise<string> {
    while (Date.now() < expiresAt) {
        const res = await fetch(ACCESS_TOKEN_URL, {
            method: "POST",
            headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                device_code: deviceCode,
                grant_type: "urn:ietf:params:oauth:grant-type:device_code",
            }),
        });
        if (!res.ok) throw new Error(`GitHub token failed: ${res.status}`);

        const data = (await res.json()) as { access_token?: string; error?: string };
        if (data.access_token) return data.access_token;

        if (data.error === "authorization_pending") {
            await new Promise((r) => setTimeout(r, intervalMs));
            continue;
        }
        if (data.error === "slow_down") {
            await new Promise((r) => setTimeout(r, intervalMs + 2000));
            continue;
        }
        if (data.error === "expired_token") throw new Error("GitHub device code expired");
        if (data.error === "access_denied") throw new Error("GitHub login cancelled");
        throw new Error(`GitHub error: ${data.error}`);
    }
    throw new Error("GitHub device code expired");
}

// ── Provider export ─────────────────────────────────────────────────

export const githubCopilotProvider: Provider = {
    id: "github-copilot",
    name: "GitHub Copilot",
    baseUrl: "https://api.githubcopilot.com",
    supportsStreaming: true,

    async login(ctx: LoginContext): Promise<ProfileCredential> {
        const device = await requestDeviceCode();

        await ctx.note(
            `Visit: ${device.verification_uri}\nCode: ${device.user_code}`,
            "GitHub Copilot",
        );
        try { await ctx.openUrl(device.verification_uri); } catch { /* manual */ }

        ctx.progress.update("Waiting for GitHub authorization...");
        const token = await pollForToken(
            device.device_code,
            Math.max(1000, device.interval * 1000),
            Date.now() + device.expires_in * 1000,
        );

        return {
            type: "token",
            provider: "github-copilot",
            token,
        };
    },

    getHeaders(cred: ProfileCredential): Record<string, string> {
        const token = cred.type === "token" ? cred.token : "";
        return {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            "Editor-Version": "smart-router/0.1.0",
        };
    },

    formatRequest(body: ChatCompletionRequest): unknown {
        return body;
    },
};
