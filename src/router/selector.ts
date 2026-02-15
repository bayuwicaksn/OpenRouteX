import type { ModelRoute, RoutingDecision, ScoringResult } from "./types.js";
import { getDefaultConfig } from "./config.js";

/**
 * Select the best model for a scoring result, considering which providers are available.
 */
export function selectModel(
    scoring: ScoringResult,
    availableProviders: Set<string>,
): RoutingDecision {
    const config = getDefaultConfig();
    const tierModels = config.tierModels[scoring.tier];

    // Find the first available model in this tier
    let selected: ModelRoute | null = null;
    const fallbackChain: ModelRoute[] = [];

    for (const route of tierModels) {
        if (availableProviders.has(route.provider)) {
            if (!selected) {
                selected = route;
            } else {
                fallbackChain.push(route);
            }
        }
    }

    // If no model in the target tier, fall back through other tiers
    if (!selected) {
        const tierOrder: Array<typeof scoring.tier> = ["SIMPLE", "MEDIUM", "COMPLEX", "REASONING"];
        for (const tier of tierOrder) {
            if (tier === scoring.tier) continue;
            for (const route of config.tierModels[tier]) {
                if (availableProviders.has(route.provider)) {
                    if (!selected) {
                        selected = route;
                    } else {
                        fallbackChain.push(route);
                    }
                }
            }
            if (selected) break;
        }
    }

    // Also add fallback order providers not yet in chain
    const usedProviders = new Set<string>();
    if (selected) usedProviders.add(selected.provider);
    for (const r of fallbackChain) usedProviders.add(r.provider);

    for (const provider of config.fallbackOrder) {
        if (!usedProviders.has(provider) && availableProviders.has(provider)) {
            // Find any model for this provider from any tier
            for (const tier of Object.values(config.tierModels)) {
                const route = tier.find((r) => r.provider === provider);
                if (route) {
                    fallbackChain.push(route);
                    usedProviders.add(provider);
                    break;
                }
            }
        }
    }

    if (!selected) {
        return {
            scoring,
            selectedModel: "none",
            selectedProvider: "none",
            fallbackChain: [],
            reason: "No available providers configured",
        };
    }

    return {
        scoring,
        selectedModel: selected.model,
        selectedProvider: selected.provider,
        fallbackChain,
        reason: `Tier ${scoring.tier} (score: ${scoring.totalScore.toFixed(1)}, confidence: ${(scoring.confidence * 100).toFixed(0)}%)`,
    };
}

/**
 * Get fallback chain for a specific provider failure.
 */
export function getNextFallback(
    decision: RoutingDecision,
    failedProvider: string,
): ModelRoute | null {
    const remaining = decision.fallbackChain.filter(
        (r) => r.provider !== failedProvider,
    );
    return remaining[0] ?? null;
}
