export { loadFoundryConfig } from './config.js';
export { FoundryModelNotFoundError } from './errors.js';
export {
  ANTHROPIC_MODEL_IDS,
  ANTHROPIC_MODELS,
  type AnthropicModelId,
  type KnownAnthropicModelId,
} from '../../foundry-catalog/src/anthropic-models.js';
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
} from '../../foundry-catalog/src/google-models.js';
export {
  type KnownOpenAIDecisionModelId,
  type KnownOpenAIEmbeddingModelId,
  type KnownOpenAIModelId,
  OPENAI_DECISION_MODEL_IDS,
  OPENAI_EMBEDDING_MODEL_IDS,
  OPENAI_EMBEDDING_MODELS,
  OPENAI_MODEL_IDS,
  OPENAI_MODELS,
  type OpenAIDecisionModelId,
  type OpenAIEmbeddingModelId,
  type OpenAIModelId,
} from '../../foundry-catalog/src/openai-models.js';
export {
  REALTIME_MODEL_IDS,
  REALTIME_MODELS,
  type RealtimeModelId,
} from '../../foundry-catalog/src/realtime-models.js';
export {
  type KnownXaiModelId,
  XAI_MODEL_IDS,
  XAI_MODELS,
  type XaiModelId,
} from '../../foundry-catalog/src/xai-models.js';
export type {
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
} from '../../foundry-catalog/src/types.js';
export type { FoundryConfig } from './types.js';
