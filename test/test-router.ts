import { classifyByRules } from "../src/router/rules.js";
import { selectModel } from "../src/router/selector.js";

console.log("\n\x1b[36m━━ Smart Router — Test Suite ━━\x1b[0m\n");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
    try {
        fn();
        console.log(`  \x1b[32m✓\x1b[0m ${name}`);
        passed++;
    } catch (err: any) {
        console.log(`  \x1b[31m✗\x1b[0m ${name}: ${err.message}`);
        failed++;
    }
}

function assert(condition: boolean, msg?: string) {
    if (!condition) throw new Error(msg ?? "Assertion failed");
}

// ── Router scoring tests ────────────────────────────────────────────

test("simple greeting → SIMPLE tier", () => {
    const result = classifyByRules("hello, how are you?");
    assert(result.tier === "SIMPLE", `expected SIMPLE, got ${result.tier}`);
});

test("code request → MEDIUM or higher", () => {
    const result = classifyByRules("write code to implement a function that sorts an array");
    assert(result.tier !== "SIMPLE", `expected MEDIUM+, got ${result.tier}`);
    assert(result.totalScore > 3, `score too low: ${result.totalScore}`);
});

test("complex system design → COMPLEX or REASONING", () => {
    const result = classifyByRules(
        "design system architecture for a distributed microservice with load balancing, " +
        "caching strategy, database design for scalable infrastructure deployment with docker kubernetes",
    );
    assert(
        result.tier === "COMPLEX" || result.tier === "REASONING",
        `expected COMPLEX/REASONING, got ${result.tier}`,
    );
});

test("debugging with reasoning → high score", () => {
    const result = classifyByRules(
        "debug this code and think step by step about the logical error in the algorithm",
    );
    assert(result.totalScore >= 8, `expected score >= 8, got ${result.totalScore}`);
});

test("translation → low/medium tier", () => {
    const result = classifyByRules("translate this to spanish");
    assert(result.totalScore > 0, "should score something");
});

test("multimodal → scores multimodal dimension", () => {
    const result = classifyByRules("describe this image and analyze the screenshot");
    const multimodal = result.dimensions.find((d) => d.dimension === "multimodal");
    assert(multimodal != null && multimodal.score > 0, "multimodal should score");
});

// ── Model selection tests ───────────────────────────────────────────

test("selects available provider", () => {
    const scoring = classifyByRules("hello");
    const available = new Set(["google", "deepseek"]);
    const decision = selectModel(scoring, available);
    assert(decision.selectedProvider !== "none", "should find a provider");
    assert(available.has(decision.selectedProvider), "selected provider should be available");
});

test("returns 'none' when no providers available", () => {
    const scoring = classifyByRules("hello");
    const decision = selectModel(scoring, new Set());
    assert(decision.selectedProvider === "none", "should be none");
});

test("builds fallback chain", () => {
    const scoring = classifyByRules("write complex code with algorithm design");
    const available = new Set(["google", "openai", "deepseek", "groq"]);
    const decision = selectModel(scoring, available);
    assert(decision.fallbackChain.length > 0, "should have fallbacks");
});

test("14 dimensions scored", () => {
    const result = classifyByRules("anything");
    assert(result.dimensions.length === 14, `expected 14 dimensions, got ${result.dimensions.length}`);
});

// ── Results ─────────────────────────────────────────────────────────

console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
