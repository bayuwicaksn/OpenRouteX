import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const storePath = join(__dirname, "..", "data", "auth-store.json");

if (!existsSync(storePath)) {
    console.log("No auth-store.json found at:", storePath);
    process.exit(0);
}

const store = JSON.parse(readFileSync(storePath, "utf8"));
let count = 0;

for (const id in store.usageStats) {
    const s = store.usageStats[id];
    const hadIssues = s.state === "COOLDOWN" || s.cooldownUntil || s.errorCount > 0 ||
        (s.modelCooldowns && Object.keys(s.modelCooldowns).length > 0);

    if (hadIssues) {
        s.state = "ACTIVE";
        delete s.cooldownUntil;
        delete s.failureReason;
        s.errorCount = 0;
        s.modelCooldowns = {};
        count++;
        console.log("Reset:", id);
    }
}

if (count > 0) {
    writeFileSync(storePath, JSON.stringify(store, null, 2) + "\n");
    console.log(`\nSuccessfully reset ${count} profiles.`);
} else {
    console.log("No profiles in cooldown.");
}
