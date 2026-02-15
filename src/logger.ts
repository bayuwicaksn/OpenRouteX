const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type Level = keyof typeof LEVELS;

let currentLevel: Level = "info";

export function setLogLevel(level: Level) {
    currentLevel = level;
}

function timestamp() {
    return new Date().toISOString().slice(11, 23);
}

function log(level: Level, prefix: string, ...args: unknown[]) {
    if (LEVELS[level] < LEVELS[currentLevel]) return;
    const tag = `\x1b[90m${timestamp()}\x1b[0m ${prefix}`;
    console.log(tag, ...args);
}

export const logger = {
    debug: (...args: unknown[]) => log("debug", "\x1b[90m[DBG]\x1b[0m", ...args),
    info: (...args: unknown[]) => log("info", "\x1b[36m[INF]\x1b[0m", ...args),
    warn: (...args: unknown[]) => log("warn", "\x1b[33m[WRN]\x1b[0m", ...args),
    error: (...args: unknown[]) => log("error", "\x1b[31m[ERR]\x1b[0m", ...args),
    ok: (...args: unknown[]) => log("info", "\x1b[32m[OK]\x1b[0m", ...args),
    route: (...args: unknown[]) => log("info", "\x1b[35m[RTE]\x1b[0m", ...args),
    audit: (...args: unknown[]) => log("info", "\x1b[34m[AUD]\x1b[0m", ...args),
};
