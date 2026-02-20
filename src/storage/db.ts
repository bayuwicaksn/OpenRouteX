import Database, { Database as DatabaseType } from "better-sqlite3";
import { join } from "node:path";
import { mkdirSync, existsSync } from "node:fs";

// Use process.cwd() instead of __dirname because tsup bundles to flat dist/
const DATA_DIR = join(process.cwd(), "data");
const DB_PATH = join(DATA_DIR, "smart-router.db");

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
}

export const db: DatabaseType = new Database(DB_PATH);

// Enable WAL mode for better concurrency
db.pragma("journal_mode = WAL");

export function initDB() {
    db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        profile_id TEXT,
        tier TEXT,
        tier_score REAL,
        task TEXT,
        latency_ms INTEGER,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        success INTEGER, -- 0 or 1
        error_msg TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_timestamp ON requests(timestamp);
    CREATE INDEX IF NOT EXISTS idx_provider ON requests(provider);

    CREATE TABLE IF NOT EXISTS api_keys (
        key_hash TEXT PRIMARY KEY,
        prefix TEXT NOT NULL,
        label TEXT,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        is_active INTEGER DEFAULT 1
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
  `);
}

// Run initialization immediately
initDB();
