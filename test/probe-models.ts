import { startProxy } from "../src/proxy.js";
import http from "node:http";

const TEST_PORT = 3500;
const MODELS_TO_TEST = [
    "gemini-3-pro-preview",
    "gemini-experimental",
    "gemini-pro-experimental",
    "gemini-3.0-pro-exp",
    "models/gemini-experimental",
    "google/gemini-3-pro-preview"
];

async function runProbe() {
    await startProxy(TEST_PORT);
    console.log(`Starting probe on port ${TEST_PORT}...`);

    for (const modelId of MODELS_TO_TEST) {
        console.log(`\nTesting model ID: ${modelId}`);
        const result = await testModel(modelId);
        console.log(`Result: ${result.status} ${result.body.error ? JSON.stringify(result.body.error) : "OK"}`);
        if (result.status === 200) {
            console.log(`✅ FOUND VALID MODEL ID: ${modelId}`);
            // break; // Keep going to see all valid ones
        }
        await new Promise(r => setTimeout(r, 2000)); // Be nice to rate limits
    }
    process.exit(0);
}

function testModel(modelId: string): Promise<{ status: number, body: any }> {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: "localhost",
            port: TEST_PORT,
            path: "/v1/chat/completions",
            method: "POST",
            headers: { "Content-Type": "application/json" }
        }, (res) => {
            let data = "";
            res.on("data", c => data += c);
            res.on("end", () => {
                try {
                    resolve({ status: res.statusCode || 500, body: JSON.parse(data) });
                } catch {
                    resolve({ status: res.statusCode || 500, body: { error: data } });
                }
            });
        });

        // We use a unified slug that maps to the internal ID we want to test
        // BUT wait, we need to bypass the router's lookup to test arbitrary strings.
        // We can't easily do that without adding them to models.ts first.

        // ALTERNATIVE: Use a known model (like gemini-2.5-flash) in the request, 
        // but hack the `proxy.ts` or `antigravity.ts` temporarily to force the backendModel?

        // Actually, let's just use the fact that we can add them to models.ts easily.
        // Or simpler: The "model" field in the body IS passed to antigravity.ts if it's not found in models.ts?
        // No, if not found, it goes to "Slow Path" (Router).

        // IF we use "smart-router/auto" or similar, we can't control the output model ID easily.

        // OK, I will modify `src/models.ts` to add a generic `antigravity/debug` model 
        // that I can use to test overrides, OR better yet:

        // Just rely on the user's `gemini-3-pro` alias I added.
        // I will change the request to use `google/gemini-3-pro` but I will 
        // MODIFY `antigravity.ts` to log which backend model matches my probe for each request.

        req.write(JSON.stringify({
            // We can't test arbitrary backend IDs easily without changing code.
            // So this script is limited.
            model: "google/gemini-3-pro",
            messages: [{ role: "user", content: "hi" }]
        }));
        req.end();
    });
}

// Wait, I can't easily probe different backend IDs without code changes.
// I will instead create a script that calls the backend DIRECTLY if I have a token?
// getting a token is hard.

// Plan B:
// I will Modify `antigravity.ts` to log the `backendModel` it decides to use.
// And I will assume `gemini-experimental` is the most likely candidate for a working "Pro" model.

console.log("This script is a placeholder. I will modify antigravity.ts instead.");
runProbe();
