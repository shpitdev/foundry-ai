import type { ModelDefinition } from '../types.js';
import { catalogModelIds, createProviderModelCatalog } from './metadata.js';

const QWEN_MODEL_DEFINITIONS = {
  'qwen3-32b': {
    rid: 'ri.language-model-service..language-model.qwen3-32b',
    modelIdentifier: 'QWEN3_32B',
    displayName: 'Qwen3 32B',
    lifecycle: 'ga',
    inputTypes: ['GENERIC_CHAT_COMPLETION'],
    contextWindow: 32000,
    maxOutputTokens: 8192,
    performance: {
      cost: 'LOW',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://qwen.ai/blog?id=qwen3',
    modelCreator: 'QWEN',
  },
  'qwen3-235b-a22b-2507': {
    rid: 'ri.language-model-service..language-model.qwen3-235b-a22b-2507',
    modelIdentifier: 'QWEN3_235B_A22B_2507',
    displayName: 'Qwen3 235B A22B 2507',
    lifecycle: 'ga',
    inputTypes: ['GENERIC_CHAT_COMPLETION'],
    contextWindow: 256000,
    maxOutputTokens: 8192,
    performance: {
      cost: 'LOW',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://qwen.ai/blog?id=qwen3',
    modelCreator: 'QWEN',
  },
} as const satisfies Record<string, ModelDefinition>;

export const QWEN_MODELS = createProviderModelCatalog('qwen', QWEN_MODEL_DEFINITIONS);
export type KnownQwenModelId = keyof typeof QWEN_MODELS;
export type QwenModelId = KnownQwenModelId | (string & Record<never, never>);
export const QWEN_MODEL_IDS = catalogModelIds(QWEN_MODELS);
