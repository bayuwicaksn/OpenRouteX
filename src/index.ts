/**
 * OpenRouteX — Main API
 *
 * Usage as library:
 *   import { route, startProxy, getAvailableProviders } from "openroutex";
 */

export { route, classifyByRules, selectModel, getDefaultConfig } from "./router/index.js";
export { startProxy } from "./proxy.js";
export { getProvider, getAllProviders } from "./providers/index.js";
export { getModelsForProvider, getAllModels, findModel } from "./models.js";
export type { ModelInfo } from "./models.js";
export {
    loadStore,
    saveStore,
    upsertProfile,
    removeProfile,
    listAllProfiles,
    listProfilesForProvider,
    getAvailableProviders,
    pickNextProfile,
    markProfileUsed,
    markProfileFailure,
    clearProfileCooldown,
    buildProfileId,
} from "./auth-store.js";
export { getStats, getStatsSummary, recordRequest } from "./stats.js";
export { logger, setLogLevel } from "./logger.js";
export type {
    Provider,
    ProfileCredential,
    OAuthCredential,
    ApiKeyCredential,
    TokenCredential,
    ChatCompletionRequest,
    ChatCompletionResponse,
    RequestStats,
    LoginContext,
    AuthProfileStore,
} from "./types.js";
export type {
    Tier,
    ScoringResult,
    RoutingDecision,
    DimensionScore,
    ModelRoute,
    RoutingConfig,
} from "./router/types.js";
