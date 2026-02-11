// test/test-suite.js
const { route, MODELS } = require('../index');

const testCases = [
  { name: "Simple", prompt: "Hello, how are you?", input: 50, output: 50 },
  { name: "Medium", prompt: "Explain quantum computing in simple terms", input: 150, output: 500 },
  { name: "Complex", prompt: "Write a Python script to scrape website with authentication", input: 300, output: 800 },
  { name: "Reasoning", prompt: "Solve this math problem: ∫(x² + 3x + 2)dx from 0 to 5", input: 100, output: 200 }
];

const EXPENSIVE_MODEL = MODELS["COMPLEX"]; // Baseline for comparison

console.log("--- Smart Router Cost Analysis Test ---\n");
console.log(`Baseline Model: ${EXPENSIVE_MODEL.id} ($${EXPENSIVE_MODEL.costInput}/$${EXPENSIVE_MODEL.costOutput})\n`);

let totalRoutedCost = 0;
let totalBaselineCost = 0;

console.log("| Test Case | Tier | Model | Score | Routed Cost | Baseline Cost | Savings |");
console.log("|---|---|---|---|---|---|---|");

testCases.forEach(tc => {
  const result = route(tc.prompt);
  const routedCost = result.calculateCost(tc.input, tc.output);
  
  // Calculate baseline cost (always using COMPLEX model)
  const baselineCost = (tc.input / 1000000) * EXPENSIVE_MODEL.costInput + (tc.output / 1000000) * EXPENSIVE_MODEL.costOutput;

  totalRoutedCost += routedCost;
  totalBaselineCost += baselineCost;
  
  let savings = 0;
  if (baselineCost > 0) {
      savings = ((baselineCost - routedCost) / baselineCost * 100).toFixed(1);
  }

  // Handle potential undefined model ID
  const modelId = result.model && result.model.id ? result.model.id.split('/').pop() : 'unknown';

  console.log(`| ${tc.name} | ${result.tier} | ${modelId} | ${result.score} | $${routedCost.toFixed(6)} | $${baselineCost.toFixed(6)} | ${savings}% |`);
});

console.log("\n--- Summary ---");
console.log(`Total Routed Cost:   $${totalRoutedCost.toFixed(6)}`);
console.log(`Total Baseline Cost: $${totalBaselineCost.toFixed(6)}`);
const netSavings = totalBaselineCost - totalRoutedCost;
console.log(`Total Savings:       $${netSavings.toFixed(6)} (${(netSavings / totalBaselineCost * 100).toFixed(1)}%)`);

if (netSavings >= 0) {
    console.log("\nTEST PASSED: Routing logic functional and efficient.");
    process.exit(0);
} else {
    console.log("\nTEST FAILED: Routing inefficient.");
    process.exit(1);
}
