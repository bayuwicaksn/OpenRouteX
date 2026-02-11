// router.js
const fs = require('fs');
const path = require('path');

// Paths
const CONFIG_DIR = path.join(__dirname, 'config');
const MODELS_PATH = path.join(CONFIG_DIR, 'models.json');
const SCORING_PATH = path.join(CONFIG_DIR, 'scoring.json');

// Load Config
let MODELS = {};
let DIMENSIONS = [];

try {
    if (fs.existsSync(MODELS_PATH)) {
        MODELS = JSON.parse(fs.readFileSync(MODELS_PATH, 'utf8'));
    } else {
        console.warn("Warning: models.json not found at " + MODELS_PATH);
    }
    
    if (fs.existsSync(SCORING_PATH)) {
        const rawDimensions = JSON.parse(fs.readFileSync(SCORING_PATH, 'utf8'));
        DIMENSIONS = rawDimensions.map(d => {
            if (d.regex) {
                // Remove leading/trailing slashes if present in JSON string (though my JSON doesn't have them)
                // But my JSON has regex strings.
                return { ...d, regex: new RegExp(d.regex, 'i') };
            }
            return d;
        });
    } else {
        console.warn("Warning: scoring.json not found at " + SCORING_PATH);
    }
} catch (e) {
    console.error("Error loading config:", e);
}

/**
 * Analyze a prompt and return a complexity score (0-100) and recommended tier.
 */
function route(prompt) {
  let score = 0;
  let matches = [];
  let reasoningMarkers = 0;
  let codeMarkers = 0;

  // 1. Calculate Score
  DIMENSIONS.forEach(dim => {
    let match = false;
    if (dim.regex) {
      match = dim.regex.test(prompt);
    } else if (dim.type === 'length') {
      match = prompt.length > (dim.threshold || 500);
    }

    if (match) {
      score += dim.weight * 10; // Scale up
      matches.push(dim.name);
      if (dim.name === "Reasoning" || dim.name === "Math") {
        reasoningMarkers++;
      }
      if (dim.name === "Code" || dim.name === "FileOps" || dim.name === "Tools") {
        codeMarkers++;
      }
    }
  });

  // 2. Determine Tier
  let tier = "MEDIUM"; // Default safety net
  
  // Logic Refinement:
  // - Reasoning/Math -> REASONING tier
  // - Heavy Code -> COMPLEX tier (usually requires better context/accuracy)
  // - Simple interactions -> SIMPLE tier
  
  if (reasoningMarkers >= 1 && (prompt.includes("solve") || prompt.includes("math") || prompt.includes("reason"))) {
     tier = "REASONING";
  } else if (codeMarkers >= 2 || score > 40) {
    tier = "COMPLEX";
  } else if (score < 15) {
    tier = "SIMPLE";
  } else {
    tier = "MEDIUM";
  }

  // 3. Select Model
  const selectedModel = MODELS[tier];
  
  // Safety check
  if (!selectedModel) {
      console.error(`No model found for tier ${tier}. Check models.json.`);
      return {
          tier: "ERROR",
          model: { id: "unknown" },
          score: score.toFixed(1),
          reason: "Configuration Error"
      };
  }

  // Cost calculation helper
  const calculateCost = (inputTokens, outputTokens) => {
      const inputCost = (inputTokens / 1000000) * selectedModel.costInput;
      const outputCost = (outputTokens / 1000000) * selectedModel.costOutput;
      return inputCost + outputCost;
  };

  return {
    tier,
    model: selectedModel,
    score: score.toFixed(1),
    reason: `Matched: ${matches.join(", ")}`,
    calculateCost
  };
}

module.exports = { route, MODELS };
