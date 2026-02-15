import { startProxy } from "../src/proxy.js";
import { Server } from "node:http";

const TEST_PORT = 3499;

async function runTest() {
    console.log("Starting proxy on port", TEST_PORT);
    // Suppress logs for cleaner output
    const consoleLog = console.log;
    // console.log = () => {}; 

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
        console.log("Fetching /v1/models...");
        const res = await fetch(`http://localhost:${TEST_PORT}/v1/models`);

        if (res.status !== 200) {
            throw new Error(`Expected status 200, got ${res.status} ${res.statusText}`);
        }

        const data = await res.json() as any;
        console.log(`Got ${data.data.length} models.`);

        if (data.object !== "list") throw new Error("Expected object: list");
        if (!Array.isArray(data.data)) throw new Error("Expected data to be an array");

        // Assert: Check for a unified slug
        const targetId = "google/gemini-2.5-flash";
        const found = data.data.find((m: any) => m.id === targetId);

        if (!found) {
            console.error("Available IDs:", data.data.map((m: any) => m.id).slice(0, 10));
            throw new Error(`Could not find model with id: ${targetId}`);
        }

        console.log(`Found model ${targetId}:`, found);

        if (found.owned_by !== "antigravity") throw new Error(`Expected owned_by: antigravity, got ${found.owned_by}`);

        console.log("\x1b[32mTest PASSED\x1b[0m");
    } catch (err: any) {
        console.error("\x1b[31mTest FAILED\x1b[0m:", err.message);
        process.exit(1);
    } finally {
        if (server!) server.close();
        process.exit(0);
    }
}

runTest();
