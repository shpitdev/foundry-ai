import { NoSuchModelError } from 'ai';
import type { FoundryLanguageModel } from '../middleware.js';
import { resolveModelTarget } from '../models/catalog.js';
import type { ModelProvider } from '../types.js';

export type OpenWeightMaker = Extract<
  ModelProvider,
  'deepseek' | 'nvidia' | 'qwen' | 'moonshot' | 'zai' | 'gemma'
>;

export interface OpenWeightLanguageProvider<Id extends string> {
  (modelId: Id): FoundryLanguageModel;
  specificationVersion: FoundryLanguageModel['specificationVersion'];
  languageModel(modelId: Id): FoundryLanguageModel;
  embeddingModel(modelId: string): never;
  imageModel(modelId: string): never;
}

export function resolveOpenWeightRid(maker: OpenWeightMaker, modelId: string): string {
  const { rid, metadata } = resolveModelTarget(modelId);
  if (
    metadata?.provider === maker ||
    (metadata === undefined &&
      /^ri\.language-model-service\.\.language-model\.[\w.-]+$/u.test(modelId))
  ) {
    return rid;
  }
  throw new NoSuchModelError({ modelId, modelType: 'languageModel' });
}

export const languageOnly = {
  embeddingModel(modelId: string): never {
    throw new NoSuchModelError({ modelId, modelType: 'embeddingModel' });
  },
  imageModel(modelId: string): never {
    throw new NoSuchModelError({ modelId, modelType: 'imageModel' });
  },
};
