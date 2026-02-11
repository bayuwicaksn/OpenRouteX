const { route } = require('../index');

// Example 1: Direct Routing
console.log("--- Example 1: Direct Routing ---");
const prompt = "Write a Python script to scrape a website";
const decision = route(prompt);
console.log(`Prompt: "${prompt}"`);
console.log(`Routed to: ${decision.tier} (${decision.model.id})`);
console.log(`Reason: ${decision.reason}`);

// Example 2: Cost Estimation
console.log("\n--- Example 2: Cost Estimation ---");
const inputTokens = 500;
const outputTokens = 1000;
const cost = decision.calculateCost(inputTokens, outputTokens);
console.log(`Estimated Cost for ${inputTokens} in / ${outputTokens} out: $${cost.toFixed(6)}`);

// Example 3: Error Handling
console.log("\n--- Example 3: Fallback Logic ---");
// The router function handles missing models gracefully by returning ERROR tier if config is broken
// Here we just show it works
console.log("Routing logic includes fallback checks.");
if (decision.model.backupId) {
    console.log(`Backup Model available: ${decision.model.backupId}`);
}
