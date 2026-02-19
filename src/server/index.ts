import { createServer, Server } from "node:http";
import { getAvailableProviders, loadStore } from "../auth/store.js";
import { logger } from "../shared/logger.js";

import {
    handleChatCompletion,
    handleModels,
    handleHealth,
    handleStatic,
    handleApiStats,
    handleApiConfig,
    handleAddProfile,
    handleDeleteProfile,
    handleApiKeys,
    handleAuthLogin,
    handleDashboardLogin,
    handleDashboardLogout,
    handleAuthStatus,
} from "./handlers.js";
import { requireDashboardAuth } from "./middleware.js";

const DEFAULT_PORT = 3402;

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
