/** Complexity tier for routing decisions */
export type Tier = "SIMPLE" | "MEDIUM" | "COMPLEX" | "REASONING";

/** Individual dimension score */
export type DimensionScore = {
    dimension: string;
    score: number;
    matchedKeywords: string[];
};

/** Result of the 14-dimension scoring */
export type ScoringResult = {
    tier: Tier;
    totalScore: number;
    dimensions: DimensionScore[];
    confidence: number;
};

/** Final routing decision */
export type RoutingDecision = {
    scoring: ScoringResult;
    selectedModel: string;
    selectedProvider: string;
    fallbackChain: Array<{ model: string; provider: string }>;
    reason: string;
};

/** Provider + model pair */
export type ModelRoute = {
    model: string;
    provider: string;
};

/** Routing configuration */
export type RoutingConfig = {
    weights: Record<string, number>;
    tierBoundaries: Record<Tier, { min: number; max: number }>;
    tierModels: Record<Tier, ModelRoute[]>;
    fallbackOrder: string[];
};
