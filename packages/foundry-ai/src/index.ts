export { loadFoundryConfig } from './config.js';
export { FoundryModelNotFoundError } from './errors.js';
export {
  ANTHROPIC_MODEL_IDS,
  ANTHROPIC_MODELS,
  type AnthropicModelId,
  type KnownAnthropicModelId,
} from './models/anthropic-models.js';
export {
  getModelMetadata,
  hasKnownModel,
  type KnownModelId,
  MODEL_CATALOG,
  MODEL_CATALOG_BY_RID,
  resolveKnownModelMetadata,
  resolveModelProvider,
  resolveModelRid,
  resolveModelTarget,
} from './models/catalog.js';
export {
  GOOGLE_MODEL_IDS,
  GOOGLE_MODELS,
  type GoogleModelId,
  type KnownGoogleModelId,
} from './models/google-models.js';
export {
  type KnownOpenAIEmbeddingModelId,
  type KnownOpenAIModelId,
  OPENAI_EMBEDDING_MODEL_IDS,
  OPENAI_EMBEDDING_MODELS,
  OPENAI_MODEL_IDS,
  OPENAI_MODELS,
  type OpenAIEmbeddingModelId,
  type OpenAIModelId,
} from './models/openai-models.js';
export {
  type KnownThirdPartyModelId,
  THIRD_PARTY_MODEL_IDS,
  THIRD_PARTY_MODELS,
  type ThirdPartyModelId,
} from './models/third-party-models.js';
export type {
  FoundryConfig,
  ModelClass,
  ModelCost,
  ModelDefinition,
  ModelInputType,
  ModelLifecycle,
  ModelMetadata,
  ModelPerformance,
  ModelProvider,
  ModelSpeed,
  ResolvedModelTarget,
} from './types.js';
