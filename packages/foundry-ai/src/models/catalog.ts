import { FoundryModelNotFoundError } from '../errors.js';
import type { ModelMetadata, ModelProvider, ResolvedModelTarget } from '../types.js';
import { ANTHROPIC_MODELS, type KnownAnthropicModelId } from './anthropic-models.js';
import { DEEPSEEK_MODELS, type KnownDeepSeekModelId } from './deepseek-models.js';
import { GEMMA_MODELS, type KnownGemmaModelId } from './gemma-models.js';
import { GOOGLE_MODELS, type KnownGoogleModelId } from './google-models.js';
import { MOONSHOT_MODELS, type KnownMoonshotModelId } from './moonshot-models.js';
import { NVIDIA_MODELS, type KnownNvidiaModelId } from './nvidia-models.js';
import {
  type KnownOpenAIEmbeddingModelId,
  type KnownOpenAIModelId,
  OPENAI_EMBEDDING_MODELS,
  OPENAI_MODELS,
} from './openai-models.js';
import { QWEN_MODELS, type KnownQwenModelId } from './qwen-models.js';
import { REALTIME_MODELS, type RealtimeModelId } from './realtime-models.js';
import { type KnownXaiModelId, XAI_MODELS } from './xai-models.js';

export type KnownModelId =
  | RealtimeModelId
  | KnownOpenAIModelId
  | KnownOpenAIEmbeddingModelId
  | KnownAnthropicModelId
  | KnownGoogleModelId
  | KnownXaiModelId
  | KnownDeepSeekModelId
  | KnownGemmaModelId
  | KnownMoonshotModelId
  | KnownNvidiaModelId
  | KnownQwenModelId;

export const MODEL_CATALOG = {
  ...OPENAI_MODELS,
  ...REALTIME_MODELS,
  ...OPENAI_EMBEDDING_MODELS,
  ...ANTHROPIC_MODELS,
  ...GOOGLE_MODELS,
  ...XAI_MODELS,
  ...DEEPSEEK_MODELS,
  ...GEMMA_MODELS,
  ...MOONSHOT_MODELS,
  ...NVIDIA_MODELS,
  ...QWEN_MODELS,
} as const satisfies Record<KnownModelId, ModelMetadata>;
export const MODEL_CATALOG_BY_RID = Object.fromEntries(
  Object.values(MODEL_CATALOG).map((metadata) => [metadata.rid, metadata]),
) as Record<string, ModelMetadata>;

// A Map, so inherited object keys such as `constructor` are not model IDs.
const MODEL_CATALOG_BY_ID: ReadonlyMap<string, ModelMetadata> = new Map(
  Object.entries(MODEL_CATALOG),
);

export function getModelMetadata(modelId: string): ModelMetadata | undefined {
  return MODEL_CATALOG_BY_ID.get(modelId);
}

export function hasKnownModel(modelId: string): modelId is KnownModelId {
  return getModelMetadata(modelId) != null;
}

export function resolveModelTarget(modelId: string): ResolvedModelTarget {
  const metadata = getModelMetadata(modelId) ?? getModelMetadataByRid(modelId);

  return {
    rid: metadata?.rid ?? modelId,
    metadata,
  };
}

export function resolveKnownModelMetadata(modelId: string): ModelMetadata {
  const metadata = getModelMetadata(modelId);

  if (metadata == null) {
    throw new FoundryModelNotFoundError(modelId);
  }

  return metadata;
}

export function resolveModelRid(modelId: string): string {
  return resolveKnownModelMetadata(modelId).rid;
}

export function resolveModelProvider(modelId: string): ModelProvider {
  return resolveKnownModelMetadata(modelId).provider;
}

function getModelMetadataByRid(modelRid: string): ModelMetadata | undefined {
  return MODEL_CATALOG_BY_RID[modelRid];
}
