import type { ModelDefinition } from '../types.js';
import { catalogModelIds, createProviderModelCatalog } from './metadata.js';

const NVIDIA_MODEL_DEFINITIONS = {
  'nemotron-3-super-120b': {
    rid: 'ri.language-model-service..language-model.nemotron-3-super-120b',
    modelIdentifier: 'NEMOTRON_3_SUPER_120B',
    displayName: 'NVIDIA Nemotron 3 Super 120B',
    lifecycle: 'ga',
    inputTypes: ['GENERIC_CHAT_COMPLETION'],
    trainingCutoffDate: '2025-06-01T00:00:00Z',
    contextWindow: 262144,
    maxOutputTokens: 32768,
    performance: {
      cost: 'LOW',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://build.nvidia.com/nvidia/nemotron-3-super-120b-a12b/modelcard',
    modelCreator: 'NVIDIA',
  },
  'nemotron-3-nano-30b': {
    rid: 'ri.language-model-service..language-model.nemotron-3-nano-30b',
    modelIdentifier: 'NEMOTRON_3_NANO_30B',
    displayName: 'NVIDIA Nemotron 3 Nano 30B',
    lifecycle: 'ga',
    inputTypes: ['GENERIC_CHAT_COMPLETION'],
    contextWindow: 256000,
    maxOutputTokens: 8000,
    performance: {
      cost: 'LOW',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://build.nvidia.com/nvidia/nemotron-3-nano-30b-a3b/modelcard',
    modelCreator: 'NVIDIA',
  },
  'nemotron-3-ultra-550b': {
    rid: 'ri.language-model-service..language-model.nemotron-3-ultra-550b-a55b-nvfp4',
    modelIdentifier: 'NEMOTRON_3_ULTRA_550B_A55B_NVFP4',
    displayName: 'NVIDIA Nemotron 3 Ultra 550B A55B NVFP4',
    lifecycle: 'experimental',
    inputTypes: ['GENERIC_CHAT_COMPLETION'],
    trainingCutoffDate: '2026-05-01T00:00:00Z',
    contextWindow: 1000000,
    maxOutputTokens: 1000000,
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b/modelcard',
    modelCreator: 'NVIDIA',
  },
} as const satisfies Record<string, ModelDefinition>;

export const NVIDIA_MODELS = createProviderModelCatalog('nvidia', NVIDIA_MODEL_DEFINITIONS);
export type KnownNvidiaModelId = keyof typeof NVIDIA_MODELS;
export type NvidiaModelId = KnownNvidiaModelId | (string & Record<never, never>);
export const NVIDIA_MODEL_IDS = catalogModelIds(NVIDIA_MODELS);
