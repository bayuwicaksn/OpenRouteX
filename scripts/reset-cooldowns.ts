import { loadStore, saveStore } from "../src/auth-store.js";

function resetCooldowns() {
    console.log("Loading auth store...");
    const store = loadStore();
    let count = 0;

    for (const id in store.usageStats) {
        if (store.usageStats[id].state === "COOLDOWN") {
            store.usageStats[id].state = "ACTIVE";
            store.usageStats[id].cooldownUntil = undefined;
            store.usageStats[id].failureReason = undefined;
            store.usageStats[id].errorCount = 0; // Optional: reset error count too
            store.usageStats[id].modelCooldowns = {}; // Clear model cooldowns
            count++;
            console.log(`Reset cooldown for profile: ${id}`);
        } else if (store.usageStats[id].modelCooldowns && Object.keys(store.usageStats[id].modelCooldowns!).length > 0) {
            store.usageStats[id].modelCooldowns = {};
            console.log(`Cleared model cooldowns for profile: ${id}`);
            count++;
        }
    }

    if (count > 0) {
        saveStore(store);
        console.log(`Successfully reset ${count} profiles.`);
    } else {
        console.log("No profiles found in cooldown.");
    }
}

resetCooldowns();
