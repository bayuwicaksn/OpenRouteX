import { startProxy } from "../src/proxy.js";
import { Server } from "node:http";
import http from "node:http";

const TEST_PORT = 3499;

async function runTest() {
    console.log("Starting proxy on port", TEST_PORT);

    let server: Server;
    try {
        server = startProxy(TEST_PORT);
    } catch (e) {
        console.error("Failed to start server:", e);
        process.exit(1);
    }

    // Wait for server to initialize
    await new Promise(r => setTimeout(r, 1000));

    try {
        console.log("Sending request to http://localhost:" + TEST_PORT + " with unified slug...");

        const data = JSON.stringify({
            model: "google/gemini-3-pro",
            messages: [
                { role: "user", content: "Say 'Unified slugs work!' if you can read this." }
            ],
            temperature: 0.1
        });

        console.log("\n--- Raw Request ---");
        console.log(data);
        console.log("-------------------");

        const req = http.request({
            hostname: "localhost",
            port: TEST_PORT,
            path: "/v1/chat/completions",
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Content-Length": data.length,
                // Mock an API key environment if needed, or ensure auth-store has it.
                // Since this uses the same auth-store as the user, it should pick up the same profiles.
            }
        }, res => {
            console.log(`Status: ${res.statusCode}`);
            console.log('Headers:', JSON.stringify(res.headers, null, 2));

            let responseBody = "";

            res.on("data", chunk => {
                responseBody += chunk;
            });

            res.on("end", () => {
                console.log("\n--- Raw Response ---");
                try {
                    const parsed = JSON.parse(responseBody);
                    console.log(JSON.stringify(parsed, null, 2));
                } catch (e) {
                    console.log(responseBody);
                }
                console.log("--------------------");

                try {
                    const json = JSON.parse(responseBody);
                    const content = json.choices?.[0]?.message?.content;
                    console.log("\n✅ Parsed Content:", content);

                    if (json._routing) {
                        console.log("\n✅ Routing Metadata:", json._routing);
                        if (json._routing.model === "gemini-2.5-flash" || json._routing.model === "google/gemini-2.5-flash") {
                            console.log("✅ Model ID mapped correctly.");
                        }

                        // In bypass mode, score is 0 and tier is SIMPLE
                        if (json._routing.tier === "SIMPLE" && (json._routing.score === 0)) {
                            console.log("✅ Explicit routing bypass confirmed (Score: 0, Tier: SIMPLE).");
                        } else {
                            console.log(`⚠️ Routing might not have been bypassed (Check score/tier). Score: ${json._routing.score}, Tier: ${json._routing.tier}`);
                            process.exit(1);
                        }
                    } else {
                        console.log("❌ Missing _routing metadata");
                        process.exit(1);
                    }
                } catch (e: any) {
                    console.log("\n❌ Failed to parse JSON:", e.message);
                    process.exit(1);
                }
                server.close();
                process.exit(0);
            });
        });

        req.on("error", error => {
            console.error(error);
            server.close();
            process.exit(1);
        });

        req.write(data);
        req.end();

    } catch (err: any) {
        console.error("\x1b[31mTest FAILED\x1b[0m:", err.message);
        if (server!) server.close();
        process.exit(1);
    }
}

runTest();
