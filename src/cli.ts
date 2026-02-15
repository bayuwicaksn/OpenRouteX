import "dotenv/config";
import { exec } from "node:child_process";
import { logger } from "./logger.js";
import { startProxy } from "./proxy.js";
import { getProvider, getAllProviders } from "./providers/index.js";
import {
    upsertProfile,
    removeProfile,
    listAllProfiles,
    getAvailableProviders,
    buildProfileId,
} from "./auth-store.js";
import { classifyByRules } from "./router/index.js";
import { selectModel } from "./router/selector.js";
import { getStatsSummary } from "./stats.js";
import type { LoginContext } from "./types.js";
import { createInterface } from "node:readline";

// ── CLI arg parsing ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];
const subCommand = args[1];

function getFlag(flag: string): string | undefined {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
}

// ── Login context for CLI ───────────────────────────────────────────

function createCliLoginContext(): LoginContext {
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    return {
        async openUrl(url: string) {
            const cmd = process.platform === "win32" ? `start "" "${url}"`
                : process.platform === "darwin" ? `open "${url}"`
                    : `xdg-open "${url}"`;
            exec(cmd);
        },
        log: (msg: string) => console.log(msg),
        async note(message: string, title?: string) {
            if (title) console.log(`\n\x1b[36m━━ ${title} ━━\x1b[0m`);
            console.log(message);
        },
        async prompt(message: string): Promise<string> {
            return new Promise((resolve) => {
                rl.question(`${message} `, (answer) => resolve(answer));
            });
        },
        progress: {
            update: (msg: string) => process.stdout.write(`\r\x1b[90m⟳ ${msg}\x1b[0m`),
            stop: (msg?: string) => {
                process.stdout.write("\r\x1b[K");
                if (msg) console.log(`\x1b[32m✓\x1b[0m ${msg}`);
            },
        },
        isRemote: false,
    };
}

// ── Commands ────────────────────────────────────────────────────────

async function cmdStart() {
    const port = Number(getFlag("--port") || process.env.SMART_ROUTER_PORT || 3402);
    startProxy(port);
}

async function cmdLogin() {
    const providerId = subCommand;
    if (!providerId) {
        console.log("\n\x1b[36mUsage:\x1b[0m openroutex login <provider> [--label <name>]\n");
        console.log("Available providers:");
        for (const p of getAllProviders()) {
            console.log(`  \x1b[33m${p.id.padEnd(20)}\x1b[0m ${p.name}`);
        }
        return;
    }

    const provider = getProvider(providerId);
    if (!provider) {
        logger.error(`Unknown provider: ${providerId}`);
        console.log("\nAvailable:", getAllProviders().map((p) => p.id).join(", "));
        return;
    }

    const ctx = createCliLoginContext();

    try {
        const credential = await provider.login(ctx);
        const fallbackEmail = (("email" in credential) && credential.email) ? credential.email as string : undefined;
        const effectiveLabel = getFlag("--label") ?? fallbackEmail ?? "default";
        const profileId = upsertProfile(providerId, credential, effectiveLabel);
        ctx.progress.stop(`Logged in as ${profileId}`);
        if ("email" in credential && credential.email) {
            console.log(`  Email: ${credential.email}`);
        }
    } catch (err: any) {
        logger.error(`Login failed: ${err?.message ?? err}`);
    }

    process.exit(0);
}

async function cmdAccounts() {
    if (subCommand === "remove") {
        const profileId = args[2];
        if (!profileId) {
            console.log("Usage: openroutex accounts remove <profileId>");
            return;
        }
        if (removeProfile(profileId)) {
            logger.ok(`Removed ${profileId}`);
        } else {
            logger.error(`Profile not found: ${profileId}`);
        }
        return;
    }

    const profiles = listAllProfiles();
    if (profiles.length === 0) {
        console.log("\n\x1b[33mNo accounts configured.\x1b[0m");
        console.log("Run: openroutex login <provider>");
        return;
    }

    console.log(`\n\x1b[36m━━ Auth Accounts (${profiles.length}) ━━\x1b[0m\n`);

    // Group by provider
    const grouped = new Map<string, typeof profiles>();
    for (const p of profiles) {
        const arr = grouped.get(p.provider) ?? [];
        arr.push(p);
        grouped.set(p.provider, arr);
    }

    for (const [provider, items] of grouped) {
        console.log(`  \x1b[33m${provider}\x1b[0m`);
        for (const item of items) {
            const status = item.inCooldown ? "\x1b[31m⏸ cooldown\x1b[0m" : "\x1b[32m● active\x1b[0m";
            const email = item.email ? ` (${item.email})` : "";
            console.log(`    ${status} ${item.id}${email} [${item.type}]`);
        }
    }

    // Show env providers
    const envProviders = getAvailableProviders();
    const storeProviders = new Set(profiles.map((p) => p.provider));
    const envOnly = [...envProviders].filter((p) => !storeProviders.has(p));
    if (envOnly.length > 0) {
        console.log(`\n  \x1b[90mAPI Key (from env):\x1b[0m ${envOnly.join(", ")}`);
    }
    console.log();
}

async function cmdRoute() {
    const prompt = args.slice(1).join(" ");
    if (!prompt) {
        console.log("Usage: openroutex route \"your prompt here\"");
        return;
    }

    const scoring = classifyByRules(prompt);
    const available = getAvailableProviders();
    const decision = selectModel(scoring, available);

    console.log(`\n\x1b[36m━━ Routing Result ━━\x1b[0m\n`);
    console.log(`  Tier:       \x1b[33m${scoring.tier}\x1b[0m`);
    console.log(`  Score:      ${scoring.totalScore.toFixed(1)}`);
    console.log(`  Confidence: ${(scoring.confidence * 100).toFixed(0)}%`);
    const combined = decision.selectedProvider !== "none"
        ? `${decision.selectedProvider}/${decision.selectedModel}`
        : decision.selectedModel;
    console.log(`  Model:      \x1b[32m${combined}\x1b[0m`);
    console.log(`  Provider:   ${decision.selectedProvider}`);

    if (scoring.dimensions.filter((d) => d.score > 0).length > 0) {
        console.log(`\n  Top dimensions:`);
        for (const d of scoring.dimensions.filter((d) => d.score > 0).slice(0, 5)) {
            console.log(`    ${d.dimension.padEnd(20)} ${d.score.toFixed(1)}  [${d.matchedKeywords.join(", ")}]`);
        }
    }

    if (decision.fallbackChain.length > 0) {
        console.log(`\n  Fallback chain:`);
        for (const f of decision.fallbackChain.slice(0, 5)) {
            console.log(`    → ${f.provider}/${f.model}`);
        }
    }
    console.log();
}

async function cmdModels() {
    const available = getAvailableProviders();
    console.log(`\n\x1b[36m━━ Available Providers (${available.size}) ━━\x1b[0m\n`);
    for (const id of available) {
        const provider = getProvider(id);
        if (provider) {
            console.log(`  \x1b[32m●\x1b[0m ${provider.id.padEnd(20)} ${provider.name}`);
        }
    }
    const all = getAllProviders();
    const unavailable = all.filter((p) => !available.has(p.id));
    if (unavailable.length > 0) {
        console.log(`\n\x1b[90m  Not configured:\x1b[0m`);
        for (const p of unavailable) {
            console.log(`  \x1b[90m○ ${p.id.padEnd(20)} ${p.name}\x1b[0m`);
        }
    }
    console.log();
}

async function cmdStats() {
    const summary = getStatsSummary();
    console.log(`\n\x1b[36m━━ Stats ━━\x1b[0m\n`);
    console.log(`  Total requests:    ${summary.totalRequests}`);
    console.log(`  Total tokens:      ${summary.totalTokens}`);
    console.log(`  Avg latency:       ${summary.avgLatencyMs}ms`);
    console.log(`  Success rate:      ${(summary.successRate * 100).toFixed(1)}%`);
    if (Object.keys(summary.providerBreakdown).length > 0) {
        console.log(`\n  Provider breakdown:`);
        for (const [prov, count] of Object.entries(summary.providerBreakdown)) {
            console.log(`    ${prov.padEnd(20)} ${count} requests`);
        }
    }
    console.log();
}

function showHelp() {
    console.log(`
\x1b[36m━━ OpenRouteX ━━\x1b[0m

Usage: openroutex <command>

Commands:
  \x1b[33mstart\x1b[0m                          Start proxy server (default port 3402)
    --port <number>              Custom port

  \x1b[33mlogin <provider>\x1b[0m               Add an auth account
    --label <name>               Label for multi-account (default: email if available, else "default")

  \x1b[33maccounts\x1b[0m                       List all auth accounts
  \x1b[33maccounts remove <id>\x1b[0m           Remove an account

  \x1b[33mroute "prompt"\x1b[0m                 Test routing (dry run)
  \x1b[33mmodels\x1b[0m                         Show provider status
  \x1b[33mstats\x1b[0m                          Show usage statistics

Providers:
  OAuth:   antigravity, openai-codex, github-copilot
  Device:  qwen, minimax
  Proxy:   copilot-proxy
  API Key: openai, google, qwen-dashscope, anthropic,
           deepseek, xai, groq, openrouter
`);
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
    switch (command) {
        case "start":
            await cmdStart();
            break;
        case "login":
            await cmdLogin();
            break;
        case "accounts":
            await cmdAccounts();
            break;
        case "route":
            await cmdRoute();
            break;
        case "models":
        case "providers":
            await cmdModels();
            break;
        case "stats":
            await cmdStats();
            break;
        case "help":
        case "--help":
        case "-h":
            showHelp();
            break;
        default:
            showHelp();
            break;
    }
}

main().catch((err) => {
    logger.error(err);
    process.exit(1);
});
