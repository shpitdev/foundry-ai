import type { ModelDefinition } from '../types.js';
import { catalogModelIds, createProviderModelCatalog } from './metadata.js';

const MOONSHOT_MODEL_DEFINITIONS = {
  'kimi-k3.1-pro-highspeed': {
    rid: 'ri.language-model-service..language-model.kimi-k3-1-pro-highspeed',
    modelIdentifier: 'KIMI_K3_1_PRO_HIGHSPEED',
    displayName: 'Kimi K3.1 Pro - Highspeed',
    lifecycle: 'experimental',
    inputTypes: ['GENERIC_CHAT_COMPLETION', 'GENERIC_VISION_COMPLETION'],
    contextWindow: 1048576,
    performance: {
      cost: 'HIGH',
      modelClass: 'REASONING',
    },
    externalUrl: 'https://huggingface.co/moonshotai/Kimi-K3.1-Pro',
    modelCreator: 'MOONSHOT_AI',
  },
  'kimi-k3': {
    rid: 'ri.language-model-service..language-model.kimi-k3',
    modelIdentifier: 'KIMI_K3',
    displayName: 'Kimi K3',
    lifecycle: 'ga',
    inputTypes: ['GENERIC_CHAT_COMPLETION', 'GENERIC_VISION_COMPLETION'],
    contextWindow: 1048576,
    performance: {
      cost: 'HIGH',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://huggingface.co/moonshotai/Kimi-K3',
    modelCreator: 'MOONSHOT_AI',
  },
  'kimi-k2.5': {
    rid: 'ri.language-model-service..language-model.kimi-k2-5',
    modelIdentifier: 'KIMI_K2_5',
    displayName: 'Kimi K2.5',
    lifecycle: 'ga',
    inputTypes: ['GENERIC_CHAT_COMPLETION', 'GENERIC_VISION_COMPLETION'],
    contextWindow: 256000,
    maxOutputTokens: 16000,
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://www.kimi.com/ai-models/kimi-k2-5',
    modelCreator: 'MOONSHOT_AI',
  },
} as const satisfies Record<string, ModelDefinition>;

export const MOONSHOT_MODELS = createProviderModelCatalog('moonshot', MOONSHOT_MODEL_DEFINITIONS);
export type KnownMoonshotModelId = keyof typeof MOONSHOT_MODELS;
export type MoonshotModelId = KnownMoonshotModelId | (string & Record<never, never>);
export const MOONSHOT_MODEL_IDS = catalogModelIds(MOONSHOT_MODELS);
