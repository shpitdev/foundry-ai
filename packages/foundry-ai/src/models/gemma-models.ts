import type { ModelDefinition } from '../types.js';
import { catalogModelIds, createProviderModelCatalog } from './metadata.js';

const GEMMA_MODEL_DEFINITIONS = {
  'gemma-4-31b': {
    rid: 'ri.language-model-service..language-model.gemma-4-31b',
    modelIdentifier: 'GEMMA_4_31B',
    displayName: 'Gemma 4 31B',
    lifecycle: 'ga',
    inputTypes: ['OPEN_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    performance: {
      cost: 'LOW',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://huggingface.co/google/gemma-4-31B-it',
    modelCreator: 'GOOGLE',
  },
  'gemma-4-26b-a4b': {
    rid: 'ri.language-model-service..language-model.gemma-4-26b-a4b',
    modelIdentifier: 'GEMMA_4_26B_A4B',
    displayName: 'Gemma 4 26B A4B',
    lifecycle: 'ga',
    inputTypes: ['OPEN_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    trainingCutoffDate: '2025-01-01T00:00:00Z',
    performance: {
      cost: 'LOW',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://huggingface.co/google/gemma-4-26B-A4B-it',
    modelCreator: 'OPEN_SOURCE',
  },
} as const satisfies Record<string, ModelDefinition>;

export const GEMMA_MODELS = createProviderModelCatalog('gemma', GEMMA_MODEL_DEFINITIONS);
export type KnownGemmaModelId = keyof typeof GEMMA_MODELS;
export type GemmaModelId = KnownGemmaModelId | (string & Record<never, never>);
export const GEMMA_MODEL_IDS = catalogModelIds(GEMMA_MODELS);
