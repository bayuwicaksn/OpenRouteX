export { classifyByRules } from "./rules.js";
export { selectModel, getNextFallback } from "./selector.js";
export { getDefaultConfig, DIMENSION_KEYWORD_MAP } from "./config.js";
export type {
    Tier,
    ScoringResult,
    DimensionScore,
    RoutingDecision,
    ModelRoute,
    RoutingConfig,
} from "./types.js";

import { classifyByRules } from "./rules.js";
import { selectModel } from "./selector.js";
import type { RoutingDecision } from "./types.js";

/**
 * Main routing entry point: classify prompt → select model.
 */
export function route(
    prompt: string,
    availableProviders: Set<string>,
): RoutingDecision {
    const scoring = classifyByRules(prompt);
    return selectModel(scoring, availableProviders);
}
