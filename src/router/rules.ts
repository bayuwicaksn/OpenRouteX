import type { DimensionScore, ScoringResult, Tier } from "./types.js";
import { DIMENSION_KEYWORD_MAP, getDefaultConfig } from "./config.js";

/**
 * Score a prompt across 14 dimensions and classify into a tier.
 * Runs in <1ms for typical prompts.
 */
export function classifyByRules(
  prompt: string,
  weights?: Record<string, number>,
  tierBoundaries?: Record<Tier, { min: number; max: number }>
): ScoringResult {
  const config = getDefaultConfig();
  const w = weights ?? config.weights;
  const boundaries = tierBoundaries ?? config.tierBoundaries;

  const original = prompt;
  const dimensions: DimensionScore[] = [];
  let totalScore = 0;

  function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function keywordMatches(text: string, kw: string): boolean {
    const pattern = new RegExp(`\\b${escapeRegex(kw)}\\b`, "i");
    return pattern.test(text);
  }

  for (const [dimension, keywords] of Object.entries(DIMENSION_KEYWORD_MAP)) {
    const matched: string[] = [];
    for (const kw of keywords) {
      if (keywordMatches(original, kw)) {
        matched.push(kw);
      }
    }
    const weight = w[dimension] ?? 1.0;
    const rawScore = matched.length * weight;

    dimensions.push({
      dimension,
      score: rawScore,
      matchedKeywords: matched,
    });
    totalScore += rawScore;
  }

  // Sort by score descending
  dimensions.sort((a, b) => b.score - a.score);

  // Determine tier
  let tier: Tier = "SIMPLE";
  for (const [t, { min, max }] of Object.entries(boundaries) as [
    Tier,
    { min: number; max: number }
  ][]) {
    if (totalScore >= min && totalScore < max) {
      tier = t;
      break;
    }
  }

  // Confidence: how concentrated the score is in top dimensions
  const topScore = dimensions.slice(0, 3).reduce((s, d) => s + d.score, 0);
  const confidence = totalScore > 0 ? Math.min(1, topScore / totalScore) : 0.5;

  return { tier, totalScore, dimensions, confidence };
}
