import type { IncomingMessage, ServerResponse } from "node:http";
import jwt from "jsonwebtoken";
import { parseCookies } from "./helpers.js";

const JWT_SECRET = process.env.SMART_ROUTER_JWT_SECRET || "smart-router-secret-key-change-me";

// ── Auth Middleware ─────────────────────────────────────────────────

export function requireDashboardAuth(
    req: IncomingMessage,
    res: ServerResponse
): boolean {
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

export { JWT_SECRET };
