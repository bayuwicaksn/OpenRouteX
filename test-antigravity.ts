#!/usr/bin/env bun

/**
 * Test script for Antigravity provider model mappings
 * This script validates that all user-specified models are correctly mapped
 */

import { createAntigravityProvider } from "./src/providers/antigravity";
import type { ChatCompletionRequest } from "./src/types";

// Test models specified by the user
const testModels = [
    "gemini-3-pro-high",
    "gemini-3-pro-low", 
    "gemini-3-flash",
    "claude-sonnet-4.5",
    "claude-sonnet-4.5-thinking",
    "claude-opus-4.5-thinking",
    "gpt-oss-120b-medium"
];

// Create a mock request for testing
function createTestRequest(model: string): ChatCompletionRequest {
    return {
        model,
        messages: [
            { role: "user", content: "Hello, test message" }
        ],
        temperature: 0.7,
        max_tokens: 100
    };
}

// Test the formatRequest function
function testModelMappings() {
    const provider = createAntigravityProvider();
    console.log("Testing Antigravity Provider Model Mappings\n");
    
    for (const model of testModels) {
        try {
            const request = createTestRequest(model);
            const formatted = provider.formatRequest(request) as any;
            
            console.log(`✅ Model: ${model}`);
            console.log(`   Backend Model: ${formatted.model}`);
            console.log(`   Request Type: ${formatted.requestType}`);
            console.log(`   User Agent: ${formatted.userAgent}`);
            
            if (formatted.request.generationConfig?.thinkingConfig) {
                console.log(`   Thinking Level: ${formatted.request.generationConfig.thinkingConfig.thinkingLevel}`);
            }
            
            console.log("");
        } catch (error) {
            console.log(`❌ Model: ${model}`);
            console.log(`   Error: ${error.message}`);
            console.log("");
        }
    }
}

// Test invalid model
function testInvalidModel() {
    const provider = createAntigravityProvider();
    console.log("Testing Invalid Model Handling\n");
    
    try {
        const request = createTestRequest("invalid-model-xyz");
        const formatted = provider.formatRequest(request);
        console.log("❌ Should have thrown error for invalid model");
    } catch (error) {
        console.log(`✅ Invalid model correctly rejected: ${error.message}`);
    }
}

// Run tests
console.log("=".repeat(60));
console.log("Antigravity Provider Model Mapping Tests");
console.log("=".repeat(60));
console.log("");

testModelMappings();
testInvalidModel();

console.log("\n" + "=".repeat(60));
console.log("Test Summary:");
console.log("- All specified models should be correctly mapped");
console.log("- Thinking levels should be set appropriately");
console.log("- Invalid models should be rejected with clear error messages");
console.log("=".repeat(60));