import type { ModelDefinition } from '../types.js';
import { catalogModelIds, createProviderModelCatalog } from './metadata.js';

const DEEPSEEK_MODEL_DEFINITIONS = {
  'deepseek-v3.2': {
    rid: 'ri.language-model-service..language-model.deepseek-v3-2',
    modelIdentifier: 'DEEPSEEK_V3_2',
    displayName: 'DeepSeek V3.2',
    lifecycle: 'ga',
    inputTypes: ['GENERIC_CHAT_COMPLETION'],
    trainingCutoffDate: '2025-03-01T00:00:00Z',
    contextWindow: 164000,
    maxOutputTokens: 8192,
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://huggingface.co/deepseek-ai/DeepSeek-V3.2',
    modelCreator: 'DEEPSEEK',
  },
} as const satisfies Record<string, ModelDefinition>;

export const DEEPSEEK_MODELS = createProviderModelCatalog('deepseek', DEEPSEEK_MODEL_DEFINITIONS);
export type KnownDeepSeekModelId = keyof typeof DEEPSEEK_MODELS;
export type DeepSeekModelId = KnownDeepSeekModelId | (string & Record<never, never>);
export const DEEPSEEK_MODEL_IDS = catalogModelIds(DEEPSEEK_MODELS);
