import { FoundryModelNotFoundError } from '../errors.js';
import type { ModelMetadata, ModelProvider, ResolvedModelTarget } from '../types.js';
import type { KnownAnthropicModelId } from './anthropic-models.js';
import { ANTHROPIC_MODELS } from './anthropic-models.js';
import type { KnownGoogleModelId } from './google-models.js';
import { GOOGLE_MODELS } from './google-models.js';
import type { KnownOpenAIEmbeddingModelId, KnownOpenAIModelId } from './openai-models.js';
import { OPENAI_EMBEDDING_MODELS, OPENAI_MODELS } from './openai-models.js';
import { REALTIME_MODELS, type RealtimeModelId } from './realtime-models.js';
import { type KnownThirdPartyModelId, THIRD_PARTY_MODELS } from './third-party-models.js';

import { type KnownXaiModelId, XAI_MODELS } from './xai-models.js';

export type KnownModelId =
  | RealtimeModelId
  | KnownOpenAIModelId
  | KnownOpenAIEmbeddingModelId
  | KnownAnthropicModelId
  | KnownGoogleModelId
  | KnownThirdPartyModelId
  | KnownXaiModelId;

export const MODEL_CATALOG = {
  ...OPENAI_MODELS,
  ...REALTIME_MODELS,
  ...OPENAI_EMBEDDING_MODELS,
  ...ANTHROPIC_MODELS,
  ...GOOGLE_MODELS,
  ...THIRD_PARTY_MODELS,
  ...XAI_MODELS,
} as const satisfies Record<KnownModelId, ModelMetadata>;
export const MODEL_CATALOG_BY_RID = Object.fromEntries(
  Object.values(MODEL_CATALOG).map((metadata) => [metadata.rid, metadata]),
) as Record<string, ModelMetadata>;

export function getModelMetadata(modelId: string): ModelMetadata | undefined {
  return MODEL_CATALOG[modelId as KnownModelId];
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
