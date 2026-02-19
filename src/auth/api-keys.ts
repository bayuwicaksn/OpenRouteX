import { db } from "../storage/db.js";
import { randomBytes, createHash } from "node:crypto";

export interface ApiKey {
    key_hash: string;
    prefix: string;
    label: string;
    created_at: number;
    last_used_at?: number;
    is_active: number;
}

export interface NewKey {
    key: string;
    hash: string;
    prefix: string;
    label: string;
    created_at: number;
}

export function generateKey(label: string): NewKey {
    const rawInfo = randomBytes(32).toString("hex");
    const key = `sk-sr-${rawInfo}`;
    const prefix = key.slice(0, 10) + "...";

    const hash = createHash("sha256").update(key).digest("hex");
    const now = Date.now();

    const stmt = db.prepare(`
    INSERT INTO api_keys (key_hash, prefix, label, created_at, is_active)
    VALUES (?, ?, ?, ?, 1)
  `);
    stmt.run(hash, prefix, label, now);

    return { key, hash, prefix, label, created_at: now };
}

export function validateKey(key: string): ApiKey | null {
    if (!key.startsWith("sk-sr-")) return null;

    const hash = createHash("sha256").update(key).digest("hex");
    const stmt = db.prepare("SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1");
    const record = stmt.get(hash) as ApiKey | undefined;

    if (record) {
        try {
            const update = db.prepare("UPDATE api_keys SET last_used_at = ? WHERE key_hash = ?");
            update.run(Date.now(), hash);
        } catch (e) {
            // Ignore stats update errors
        }
        return record;
    }

    return null;
}

export function listKeys(): ApiKey[] {
    const stmt = db.prepare("SELECT * FROM api_keys ORDER BY created_at DESC");
    return stmt.all() as ApiKey[];
}

export function revokeKey(hash: string): void {
    const stmt = db.prepare("DELETE FROM api_keys WHERE key_hash = ?");
    stmt.run(hash);
}
