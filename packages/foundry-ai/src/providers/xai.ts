import { createXai } from '@ai-sdk/xai';
import { NoSuchModelError } from 'ai';
import { resolveFoundryConfig } from '../config.js';
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
  chat(modelId: XaiModelId): FoundryLanguageModel;
  embeddingModel(modelId: string): never;
  imageModel(modelId: string): never;
}

/** Foundry's beta language routes, using the native xAI SDK and xai options. */
export function createFoundryXai(config: FoundryConfig): FoundryXaiProvider {
  const resolved = resolveFoundryConfig(config, 'createFoundryXai');
  const providerId = 'foundry-xai';
  const baseProvider = createXai({
    apiKey: resolved.token,
    baseURL: `${resolved.foundryUrl}/api/v2/llm/proxy/xai/v1`,
    headers: {
      ...(resolved.attributionRid ? { attribution: resolved.attributionRid } : {}),
      ...(resolved.traceParent ? { traceParent: resolved.traceParent } : {}),
      ...(resolved.traceState ? { traceState: resolved.traceState } : {}),
    },
    fetch: createXaiProxyFetch(),
  });

  const createLanguageModel = (
    modelId: XaiModelId,
    route: 'responses' | 'chat',
  ): FoundryLanguageModel => {
    const { rid, metadata } = resolveModelTarget(modelId);
    if (metadata && metadata.provider !== 'xai') {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    }
    return wrapFoundryLanguageModel(baseProvider[route](rid), {
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
            xai: { ...options, store: route === 'responses' ? false : undefined },
          },
        };
      },
    });
  };

  const responses = (modelId: XaiModelId) => createLanguageModel(modelId, 'responses');
  const provider = responses as FoundryXaiProvider;
  provider.specificationVersion = baseProvider.specificationVersion;
  provider.languageModel = responses;
  provider.responses = responses;
  provider.chat = (modelId) => createLanguageModel(modelId, 'chat');
  provider.embeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.imageModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  return provider;
}
