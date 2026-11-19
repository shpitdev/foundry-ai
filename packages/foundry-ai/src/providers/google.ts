import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { NoSuchModelError } from 'ai';
import { foundryHeaders, resolveFoundryConfig } from '../config.js';
import { type FoundryLanguageModel, wrapFoundryLanguageModel } from '../middleware.js';
import { resolveModelTarget } from '../models/catalog.js';
import type { GoogleModelId } from '../models/google-models.js';
import type { FoundryConfig } from '../types.js';

export interface FoundryGoogleProvider {
  (modelId: GoogleModelId): FoundryLanguageModel;
  specificationVersion: FoundryLanguageModel['specificationVersion'];
  languageModel(modelId: GoogleModelId): FoundryLanguageModel;
  chat(modelId: GoogleModelId): FoundryLanguageModel;
  generativeAI(modelId: GoogleModelId): FoundryLanguageModel;
  embeddingModel(modelId: string): never;
  imageModel(modelId: string): never;
}

export function createFoundryGoogle(config: FoundryConfig): FoundryGoogleProvider {
  const providerId = 'foundry-google';
  const resolvedConfig = resolveFoundryConfig(config, 'createFoundryGoogle');
  const baseProvider = createGoogleGenerativeAI({
    apiKey: resolvedConfig.token,
    baseURL: `${resolvedConfig.foundryUrl}/api/v2/llm/proxy/google/v1`,
    fetch: createGoogleProxyFetch(resolvedConfig.token),
    headers: foundryHeaders(resolvedConfig),
    name: providerId,
  });

  const createLanguageModel = (modelId: GoogleModelId): FoundryLanguageModel => {
    const resolvedModel = resolveModelTarget(modelId);

    return wrapFoundryLanguageModel(baseProvider.chat(resolvedModel.rid), {
      modelId,
      providerId,
    });
  };

  return Object.assign((modelId: GoogleModelId) => createLanguageModel(modelId), {
    specificationVersion: baseProvider.specificationVersion,
    languageModel: createLanguageModel,
    chat: createLanguageModel,
    generativeAI: createLanguageModel,
    embeddingModel: (modelId: string): never => {
      throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
    },
    imageModel: (modelId: string): never => {
      throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
    },
  });
}

function createGoogleProxyFetch(token: string): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init);
    const headers = new Headers(request.headers);

    headers.delete('x-goog-api-key');
    headers.set('Authorization', `Bearer ${token}`);

    return fetch(new Request(request, { headers }));
  };
}
