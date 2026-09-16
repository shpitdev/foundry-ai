import { createOpenAI } from '@ai-sdk/openai';
import { NoSuchModelError } from 'ai';
import { resolveFoundryConfig } from '../config.js';
import { type FoundryLanguageModel, wrapFoundryLanguageModel } from '../middleware.js';
import { resolveModelTarget } from '../models/catalog.js';
import type { ThirdPartyModelId } from '../models/third-party-models.js';
import type { FoundryConfig } from '../types.js';

export interface FoundryThirdPartyProvider {
  (modelId: ThirdPartyModelId): FoundryLanguageModel;
  specificationVersion: FoundryLanguageModel['specificationVersion'];
  languageModel(modelId: ThirdPartyModelId): FoundryLanguageModel;
  embeddingModel(modelId: string): never;
  imageModel(modelId: string): never;
}

/** Routes known third-party aliases and RIDs through their verified Foundry proxy. */
export function createFoundryThirdParty(config: FoundryConfig): FoundryThirdPartyProvider {
  const resolved = resolveFoundryConfig(config, 'createFoundryThirdParty');
  const providerId = 'foundry-third-party';
  const headers = {
    ...(resolved.attributionRid ? { attribution: resolved.attributionRid } : {}),
    ...(resolved.traceParent ? { traceParent: resolved.traceParent } : {}),
    ...(resolved.traceState ? { traceState: resolved.traceState } : {}),
  };
  const openai = createOpenAI({
    apiKey: resolved.token,
    baseURL: `${resolved.foundryUrl}/api/v2/llm/proxy/openai/v1`,
    headers,
    name: providerId,
  });

  const createLanguageModel = (modelId: ThirdPartyModelId): FoundryLanguageModel => {
    const { rid, metadata } = resolveModelTarget(modelId);
    if (metadata?.provider !== 'third-party' || metadata.transport == null) {
      throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
    }
    if (metadata.transport === 'unavailable') {
      throw new NoSuchModelError({
        modelId,
        modelType: 'languageModel',
        message: `${modelId} is enrolled in Foundry, but has no verified provider-compatible proxy route. See docs/README.md.`,
      });
    }
    const model = metadata.transport === 'openai-chat' ? openai.chat(rid) : openai.responses(rid);
    return wrapFoundryLanguageModel(model, {
      modelId,
      providerId,
      transformParams: (params) => {
        const options = params.providerOptions?.openai ?? {};
        if (options.store === true) {
          throw new Error(
            'Foundry third-party models do not support providerOptions.openai.store=true.',
          );
        }
        return {
          ...params,
          providerOptions: {
            ...params.providerOptions,
            openai: { ...options, store: metadata.transport === 'openai-chat' ? undefined : false },
          },
        };
      },
    });
  };

  const provider = createLanguageModel as FoundryThirdPartyProvider;
  provider.specificationVersion = openai.specificationVersion;
  provider.languageModel = createLanguageModel;
  provider.embeddingModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  };
  provider.imageModel = (modelId) => {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  };
  return provider;
}
