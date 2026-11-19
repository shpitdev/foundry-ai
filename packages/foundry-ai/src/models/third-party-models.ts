import type { ModelDefinition } from '../types.js';
import { createProviderModelCatalog } from './metadata.js';

// Metadata from Foundry enrollment; transport verified through live proxy requests.
const THIRD_PARTY_MODEL_DEFINITIONS = {
  'gemma-4-31b': {
    rid: 'ri.language-model-service..language-model.gemma-4-31b',
    modelIdentifier: 'GEMMA_4_31B',
    displayName: 'Gemma 4 31B',
    lifecycle: 'ga',
    inputTypes: ['OPEN_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://huggingface.co/google/gemma-4-31B-it',
    modelCreator: 'GOOGLE',
    transport: 'openai-responses',
  },
  'llama-3-3-nemotron-super-49b-v1-5': {
    rid: 'ri.language-model-service..language-model.llama-3-3-nemotron-super-49b-v1-5',
    modelIdentifier: 'LLAMA_3_3_NEMOTRON_SUPER_49B_V1_5',
    displayName: 'Llama 3.3 Nemotron Super 49b v1.5',
    lifecycle: 'ga',
    inputTypes: [],
    performance: {
      cost: 'MEDIUM',
      modelClass: 'HEAVYWEIGHT',
      speed: 'MEDIUM',
    },
    trainingCutoffDate: '2023-12-01T00:00:00Z',
    modelCreator: 'NVIDIA',
    transport: 'unavailable',
  },
  'gemma-4-26b-a4b': {
    rid: 'ri.language-model-service..language-model.gemma-4-26b-a4b',
    modelIdentifier: 'GEMMA_4_26B_A4B',
    displayName: 'Gemma 4 26B A4B',
    lifecycle: 'ga',
    inputTypes: ['OPEN_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    trainingCutoffDate: '2025-01-01T00:00:00Z',
    externalUrl: 'https://huggingface.co/google/gemma-4-26B-A4B-it',
    modelCreator: 'OPEN_SOURCE',
    transport: 'openai-responses',
  },
} as const satisfies Record<string, ModelDefinition>;

export const THIRD_PARTY_MODELS = createProviderModelCatalog(
  'third-party',
  THIRD_PARTY_MODEL_DEFINITIONS,
);
export type KnownThirdPartyModelId = keyof typeof THIRD_PARTY_MODELS;
export type ThirdPartyModelId = KnownThirdPartyModelId | (string & {});
export const THIRD_PARTY_MODEL_IDS = Object.freeze(
  Object.keys(THIRD_PARTY_MODELS),
) as readonly KnownThirdPartyModelId[];
