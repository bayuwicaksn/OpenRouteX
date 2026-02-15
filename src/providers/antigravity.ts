import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type {
  Provider,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ProfileCredential,
  OAuthCredential,
  LoginContext,
} from "../types.js";

// ── OAuth constants (from google-antigravity-auth) ─────────

const CLIENT_ID = Buffer.from(
  "MTA3MTAwNjA2MDU5MS10bWhzc2luMmgyMWxjcmUyMzV2dG9sb2poNGc0MDNlcC5hcHBzLmdvb2dsZXVzZXJjb250ZW50LmNvbQ==",
  "base64"
).toString();

const CLIENT_SECRET = Buffer.from(
  "R09DU1BYLUs1OEZXUjQ4NkxkTEoxbUxCOHNYQzR6NnFEQWY=",
  "base64"
).toString();

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json";
const REDIRECT_URI = "http://localhost:51121/oauth-callback";
const CODE_ASSIST_ENDPOINT = "https://cloudcode-pa.googleapis.com";

const SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

// ── PKCE──────────────────────────────────────────────────────────────

function generatePkce() {
  const verifier = randomBytes(32).toString("hex");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

// ── Local callback server ───────────────────────────────────────────

function waitForCallback(
  expectedState: string,
  timeoutMs = 300_000
): Promise<{ code: string }> {
  return new Promise((resolve, reject) => {
    let timer: NodeJS.Timeout | null = null;
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:51121`);
      if (url.pathname !== "/oauth-callback") {
        res.statusCode = 404;
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");

      if (error) {
        res.statusCode = 400;
        res.end(`Auth error: ${error}`);
        finish(new Error(`OAuth error: ${error}`));
        return;
      }

      if (!code || state !== expectedState) {
        res.statusCode = 400;
        res.end("Invalid callback");
        finish(new Error("Invalid OAuth callback"));
        return;
      }

      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(
        "<!doctype html><html><body><h2>Antigravity OAuth complete</h2>" +
        "<p>You can close this window.</p></body></html>"
      );
      finish(undefined, { code });
    });

    const finish = (err?: Error, result?: { code: string }) => {
      if (timer) clearTimeout(timer);
      try {
        server.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else if (result) resolve(result);
    };

    server.once("error", (err) => finish(err));
    server.listen(51121, "localhost");
    timer = setTimeout(() => finish(new Error("OAuth timeout")), timeoutMs);
  });
}

// ── Token exchange ──────────────────────────────────────────────────

async function exchangeCode(
  code: string,
  verifier: string,
  projectId?: string
): Promise<OAuthCredential> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  if (!data.refresh_token) throw new Error("No refresh token received");

  // Get user email
  let email: string | undefined;
  try {
    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userRes.ok) {
      const user = (await userRes.json()) as { email?: string };
      email = user.email;
    }
  } catch {
    /* ignore */
  }

  // Discover project
  const validProjectId = projectId || await discoverProject(data.access_token);

  return {
    type: "oauth",
    provider: "antigravity",
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
    email,
    projectId: validProjectId,
  };
}

async function discoverProject(accessToken: string): Promise<string> {
  const envProject =
    process.env.GOOGLE_CLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT_ID;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "User-Agent": "smart-router/0.1.0",
  };

  try {
    const res = await fetch(
      `${CODE_ASSIST_ENDPOINT}/v1internal:loadCodeAssist`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          cloudaicompanionProject: envProject,
          metadata: {
            ideType: "IDE_UNSPECIFIED",
            platform: "PLATFORM_UNSPECIFIED",
            pluginType: "GEMINI",
            duetProject: envProject,
          },
        }),
      }
    );

    if (res.ok) {
      const data = (await res.json()) as {
        cloudaicompanionProject?: string | { id?: string };
        currentTier?: { id?: string };
      };
      const proj = data.cloudaicompanionProject;
      if (typeof proj === "string" && proj) return proj;
      if (typeof proj === "object" && proj?.id) return proj.id;
    }
  } catch {
    /* ignore */
  }

  if (envProject) return envProject;

  // Try onboarding to free tier
  try {
    const res = await fetch(`${CODE_ASSIST_ENDPOINT}/v1internal:onboardUser`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        tierId: "free-tier",
        metadata: {
          ideType: "IDE_UNSPECIFIED",
          platform: "PLATFORM_UNSPECIFIED",
          pluginType: "GEMINI",
        },
      }),
    });
    if (res.ok) {
      const lro = (await res.json()) as {
        done?: boolean;
        response?: { cloudaicompanionProject?: { id?: string } };
      };
      const id = lro.response?.cloudaicompanionProject?.id;
      if (id) return id;
    }
  } catch {
    /* ignore */
  }

  throw new Error(
    "Could not discover Google Cloud project. Set GOOGLE_CLOUD_PROJECT."
  );
}

// ── Token refresh ───────────────────────────────────────────────────

async function refreshToken(cred: OAuthCredential): Promise<OAuthCredential> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: cred.refresh,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);

  const data = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };

  return {
    ...cred,
    access: data.access_token,
    refresh: data.refresh_token ?? cred.refresh,
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}

// ── Response conversion (Cloud Code Assist → OpenAI format) ─────────

function codeAssistToOpenAI(
  raw: unknown,
  model: string
): ChatCompletionResponse {
  let response:
    | {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
        finishReason?: string;
      }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    }
    | undefined;

  // Handle standard JSON response
  if (typeof raw === "object" && raw !== null) {
    const wrapper = raw as { response?: typeof response };
    response = wrapper.response ?? (raw as typeof response);
  }
  // Handle SSE stream text (aggregate chunks)
  else if (typeof raw === "string") {
    const lines = raw.split("\n");
    const partsText: string[] = [];
    let finishReason = "stop";
    let usage = {
      promptTokenCount: 0,
      candidatesTokenCount: 0,
      totalTokenCount: 0,
    };

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const chunk = JSON.parse(line.slice(6));
        const chunkResp = chunk.response;
        if (!chunkResp) continue;

        // Aggregate content
        const candidates = chunkResp.candidates;
        if (candidates && candidates.length > 0) {
          const content = candidates[0].content;
          if (content?.parts) {
            for (const part of content.parts) {
              if (part.text) partsText.push(part.text);
            }
          }
          if (candidates[0].finishReason) {
            finishReason =
              candidates[0].finishReason === "STOP" ? "stop" : "length";
          }
        }

        // Update usage from last chunk containing it
        if (chunkResp.usageMetadata) {
          usage = chunkResp.usageMetadata;
        }
      } catch {
        // Ignore parse errors for individual lines
      }
    }

    // Construct aggregated response object
    response = {
      candidates: [
        {
          content: { parts: [{ text: partsText.join("") }] },
          finishReason,
        },
      ],
      usageMetadata: usage,
    };
  }

  const parts = response?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("");

  return {
    id: `ag-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason:
          response?.candidates?.[0]?.finishReason === "STOP" ? "stop" : "stop",
      },
    ],
    usage: {
      prompt_tokens: response?.usageMetadata?.promptTokenCount ?? 0,
      completion_tokens: response?.usageMetadata?.candidatesTokenCount ?? 0,
      total_tokens: response?.usageMetadata?.totalTokenCount ?? 0,
    },
  };
}

const ANTIGRAVITY_VERSION = "1.15.8";

// ── Provider export ─────────────────────────────────────────────────

export const antigravityProvider: Provider = {
  id: "antigravity",
  name: "Google Antigravity",
  baseUrl: CODE_ASSIST_ENDPOINT,
  supportsStreaming: true,

  async login(ctx: LoginContext, options?: { projectId?: string }): Promise<ProfileCredential> {
    const { verifier, challenge } = generatePkce();
    const params = new URLSearchParams({
      client_id: CLIENT_ID,
      response_type: "code",
      redirect_uri: REDIRECT_URI,
      scope: SCOPES.join(" "),
      code_challenge: challenge,
      code_challenge_method: "S256",
      state: verifier,
      access_type: "offline",
      prompt: "consent",
    });

    const authUrl = `${AUTH_URL}?${params.toString()}`;

    await ctx.note(
      "Browser will open for Google authentication.\n" +
      "Sign in with your Google account for Antigravity access.\n" +
      "The callback will be captured on localhost:51121.",
      "Google Antigravity OAuth"
    );

    ctx.progress.update("Waiting for browser sign-in...");
    try {
      await ctx.openUrl(authUrl);
    } catch {
      ctx.log(`\nOpen this URL:\n\n${authUrl}\n`);
    }

    const { code } = await waitForCallback(verifier);
    ctx.progress.update("Exchanging tokens...");
    return exchangeCode(code, verifier, options?.projectId);
  },

  getHeaders(cred: ProfileCredential): Record<string, string> {
    const token = cred.type === "oauth" ? cred.access : "";
    return {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": `antigravity/${ANTIGRAVITY_VERSION} win32/x64`,
      "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
      "Client-Metadata": JSON.stringify({
        ideType: "IDE_UNSPECIFIED",
        platform: "PLATFORM_UNSPECIFIED",
        pluginType: "GEMINI",
      }),
    };
  },

  // Cloud Code Assist: POST {endpoint}/v1internal:streamGenerateContent?alt=sse
  buildUrl(baseUrl: string, _model: string): string {
    return `${baseUrl}/v1internal:streamGenerateContent?alt=sse`;
  },

  formatRequest(body: ChatCompletionRequest): unknown {
    // Convert OpenAI messages format → Cloud Code Assist wrapped format
    const systemMsg = body.messages.find((m) => m.role === "system");
    const nonSystemMsgs = body.messages.filter((m) => m.role !== "system");

    const request: Record<string, unknown> = {
      contents: nonSystemMsgs.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content ?? "" }],
      })),
    };

    if (systemMsg) {
      request.systemInstruction = {
        role: "user",
        parts: [{ text: systemMsg.content ?? "" }],
      };
    }

    const generationConfig: Record<string, unknown> = {};
    if (body.temperature != null)
      generationConfig.temperature = body.temperature;
    if (body.max_tokens != null)
      generationConfig.maxOutputTokens = body.max_tokens;
    if (body.top_p != null) generationConfig.topP = body.top_p;
    if (Object.keys(generationConfig).length > 0) {
      request.generationConfig = generationConfig;
    }

    // The outer wrapper that Cloud Code Assist expects
    // Follow OpenClaw backend model normalization approach
    let backendModel = body.model ?? "gemini-2.5-flash";

    // Model alias resolution similar to OpenClaw's opencode-zen-models.ts
    const resolveModelAlias = (modelId: string): string => {
      const aliases: Record<string, string> = {
        // Gemini aliases (following OpenClaw conventions)
        gemini: "gemini-3-pro",
        "gemini-pro": "gemini-3-pro",
        "gemini-3": "gemini-3-pro",
        flash: "gemini-3-flash",
        "gemini-flash": "gemini-3-flash",
        "gemini-2.5": "gemini-3-pro",
        "gemini-2.5-pro": "gemini-3-pro",
        "gemini-2.5-flash": "gemini-3-flash",

        // Claude aliases (following OpenClaw conventions)
        opus: "claude-opus-4-6",
        "opus-4.6": "claude-opus-4-6",
        "opus-4.5": "claude-opus-4-5",
        "opus-4": "claude-opus-4-6",
        sonnet: "claude-opus-4-6",
        "sonnet-4": "claude-opus-4-6",
        haiku: "claude-opus-4-6",
        "haiku-3.5": "claude-opus-4-6",
      };

      const normalized = modelId.toLowerCase().trim();
      return aliases[normalized] || modelId;
    };

    // Resolve aliases first
    backendModel = resolveModelAlias(backendModel);

    // Note: GPT-OSS models are not supported via Antigravity - use OpenClaw's Venice provider instead
    if (backendModel.includes("gpt-oss")) {
      throw new Error(
        `GPT-OSS models (${backendModel}) are not supported via Antigravity. ` +
        `Please use OpenClaw's Venice provider for GPT-OSS access: ` +
        `openclaw login venice && openclaw message send --model venice/${backendModel} "your message"`
      );
    } else if (backendModel.includes("nano-banana")) {
      backendModel = "gemini-2.5-flash";
    }

    // Apply OpenClaw-style model normalization
    // Follow normalizeGoogleModelId from models-config.providers.ts
    if (backendModel === "gemini-3-pro") {
      backendModel = "gemini-3-pro"; // Use exact OpenClaw backend ID
    } else if (backendModel === "gemini-3-flash") {
      backendModel = "gemini-3-flash"; // Use exact OpenClaw backend ID
    }

    // Handle specific model variants with thinking configuration
    if (backendModel === "gemini-3-pro-high") {
      backendModel = "gemini-3-pro"; // Use exact OpenClaw backend ID
      (request as any).generationConfig = {
        ...(request as any).generationConfig,
        thinkingConfig: { thinkingLevel: "HIGH" },
      };
    } else if (backendModel === "gemini-3-pro-low") {
      backendModel = "gemini-3-pro"; // Use exact OpenClaw backend ID
      (request as any).generationConfig = {
        ...(request as any).generationConfig,
        thinkingConfig: { thinkingLevel: "LOW" },
      };
    } else if (backendModel === "gemini-3-pro") {
      // Default thinking level for gemini-3-pro (following OpenClaw convention)
      (request as any).generationConfig = {
        ...(request as any).generationConfig,
        thinkingConfig: { thinkingLevel: "HIGH" },
      };
    } else if (backendModel.includes("claude-sonnet-4.5")) {
      // Map Claude Sonnet 4.5 variants to OpenClaw backend model IDs
      if (backendModel.includes("thinking")) {
        backendModel = "claude-opus-4-6"; // OpenClaw backend ID
      } else {
        backendModel = "claude-opus-4-6"; // OpenClaw backend ID
      }
    } else if (backendModel.includes("claude-opus-4.5")) {
      // Map Claude Opus 4.5 variants to OpenClaw backend model IDs
      if (backendModel.includes("thinking")) {
        backendModel = "claude-opus-4-6"; // OpenClaw backend ID
      } else {
        backendModel = "claude-opus-4-6"; // OpenClaw backend ID
      }
    } else if (backendModel === "claude-opus-4-6") {
      // OpenClaw backend model - use exact match
      backendModel = "claude-opus-4-6";
    } else if (backendModel === "claude-opus-4-5") {
      // OpenClaw backend model - use exact match
      backendModel = "claude-opus-4-5";
    } else if (backendModel === "claude-opus-4") {
      // OpenClaw backend model - use exact match
      backendModel = "claude-opus-4-6";
    }

    // Validate that the backend model is supported
    // Updated to match OpenClaw backend model IDs exactly
    const supportedModels = [
      // Gemini models (OpenClaw backend IDs)
      "gemini-3-flash",
      "gemini-3-flash-preview",
      "gemini-3-pro",
      "gemini-3-pro-preview",
      // Claude models (OpenClaw backend IDs)
      "claude-opus-4-6",
      "claude-opus-4-5",
      "claude-opus-4",
      // Legacy backend models (for compatibility)
      "gemini-2.5-flash",
      "gemini-2.5-flash-lite",
      "gemini-2.5-pro",
      "claude-3.5-sonnet",
      "claude-3.7-sonnet-thinking",
      "claude-3.5-opus",
      "claude-3.7-opus-thinking",
    ];

    if (!supportedModels.includes(backendModel)) {
      throw new Error(
        `Unsupported model: ${backendModel}. Supported models: ${supportedModels.join(
          ", "
        )}`
      );
    }

    return {
      // projectId is set dynamically per-credential by the proxy if needed
      // but for OAuth it's implicit or passed differently.
      // OpenClaw passes `project: projectId` here.
      // But we don't have access to credential here in formatRequest.
      // We will inject it in proxy.ts if possible, or just rely on headers.
      model: backendModel,
      request,
      requestType: "agent",
      userAgent: "antigravity",
      requestId: `agent-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 11)}`,
    };
  },

  formatResponse(raw: unknown, modelId?: string): ChatCompletionResponse {
    return codeAssistToOpenAI(
      raw,
      modelId ? `antigravity/${modelId}` : "antigravity"
    );
  },

  refreshToken,
  rateLimits: {
    requestsPerMinute: 15, // Conservative limit for Gemini Free
    requestsPerDay: 1500,
  },
};
