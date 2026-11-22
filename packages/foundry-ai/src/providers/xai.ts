import { createXai } from '@ai-sdk/xai';
import { NoSuchModelError } from 'ai';
import { foundryHeaders, resolveFoundryConfig } from '../config.js';
import { type FoundryLanguageModel, wrapFoundryLanguageModel } from '../middleware.js';
import { resolveModelTarget } from '../models/catalog.js';
import type { XaiModelId } from '../models/xai-models.js';
import type { FoundryConfig } from '../types.js';
import { createXaiProxyFetch } from './xai-compat.js';

export interface FoundryXaiProvider {
  (modelId: XaiModelId): FoundryLanguageModel;
  specificationVersion: FoundryLanguageModel['specificationVersion'];
  languageModel(modelId: XaiModelId): FoundryLanguageModel;
  responses(modelId: XaiModelId): FoundryLanguageModel;
  embeddingModel(modelId: string): never;
  imageModel(modelId: string): never;
}

/** Foundry's xAI Responses route, using the native xAI SDK and xai options. */
export function createFoundryXai(config: FoundryConfig): FoundryXaiProvider {
  const resolved = resolveFoundryConfig(config, 'createFoundryXai');
  const providerId = 'foundry-xai';
  const baseProvider = createXai({
    apiKey: resolved.token,
    baseURL: `${resolved.foundryUrl}/api/v2/llm/proxy/xai/v1`,
    headers: foundryHeaders(resolved),
    fetch: createXaiProxyFetch(),
  });

  const responses = (modelId: XaiModelId): FoundryLanguageModel => {
    const { rid, metadata } = resolveModelTarget(modelId);
    if (metadata && metadata.provider !== 'xai') {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    }
    return wrapFoundryLanguageModel(baseProvider.responses(rid), {
      modelId,
      providerId,
      transformParams: (params) => {
        const options = params.providerOptions?.xai ?? {};
        if (options.store === true) {
          throw new Error('Foundry xAI does not support providerOptions.xai.store=true.');
        }
        return {
          ...params,
          providerOptions: {
            ...params.providerOptions,
            xai: { ...options, store: false },
          },
        };
      },
    });
  };

  return Object.assign(responses, {
    specificationVersion: baseProvider.specificationVersion,
    languageModel: responses,
    responses,
    embeddingModel: (modelId: string): never => {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
    imageModel: (modelId: string): never => {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
  });
}
