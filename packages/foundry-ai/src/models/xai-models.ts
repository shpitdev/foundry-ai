import type { ModelDefinition } from '../types.js';
import { createProviderModelCatalog } from './metadata.js';

// Foundry enrollment metadata; Responses remains the default proxy route.
const XAI_MODEL_DEFINITIONS = {
  'grok-4-3': {
    rid: 'ri.language-model-service..language-model.grok-4-3',
    modelIdentifier: 'GROK_4_3',
    displayName: 'Grok 4.3',
    lifecycle: 'ga',
    inputTypes: ['X_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
    },
    trainingCutoffDate: '2025-12-01T00:00:00Z',
    externalUrl: 'https://docs.x.ai/developers/models/grok-4.3',
    modelCreator: 'X_AI',
    transport: 'xai-responses',
  },
  'grok-4-5': {
    rid: 'ri.language-model-service..language-model.grok-4-5',
    modelIdentifier: 'GROK_4_5',
    displayName: 'Grok 4.5',
    lifecycle: 'ga',
    inputTypes: ['X_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
    },
    trainingCutoffDate: '2026-02-01T00:00:00Z',
    externalUrl: 'https://docs.x.ai/developers/models/grok-4.5',
    modelCreator: 'X_AI',
    transport: 'xai-responses',
  },
  'grok-4-6': {
    rid: 'ri.language-model-service..language-model.grok-4-6',
    modelIdentifier: 'GROK_4_6',
    displayName: 'Grok 4.6',
    lifecycle: 'ga',
    inputTypes: ['X_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
    },
    trainingCutoffDate: '2026-02-01T00:00:00Z',
    externalUrl: 'https://docs.x.ai/developers/models/grok-4.6',
    modelCreator: 'X_AI',
    transport: 'xai-responses',
  },
  'grok-4-7': {
    rid: 'ri.language-model-service..language-model.grok-4-7',
    modelIdentifier: 'GROK_4_7',
    displayName: 'Grok 4.7',
    lifecycle: 'ga',
    inputTypes: ['X_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    performance: {
      // The listing publishes no cost for this model.
      modelClass: 'REASONING',
    },
    trainingCutoffDate: '2026-05-01T00:00:00Z',
    modelCreator: 'X_AI',
    transport: 'xai-responses',
  },
  'grok-420-non-reasoning-latest': {
    rid: 'ri.language-model-service..language-model.grok-420-non-reasoning-latest',
    modelIdentifier: 'GROK_420_NON_REASONING_LATEST',
    displayName: 'Grok 420 Non-Reasoning Latest',
    lifecycle: 'ga',
    inputTypes: ['X_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    performance: {
      cost: 'MEDIUM',
      modelClass: 'LIGHTWEIGHT',
    },
    trainingCutoffDate: '2026-01-01T00:00:00Z',
    modelCreator: 'X_AI',
    transport: 'xai-responses',
  },
  'grok-420-reasoning-latest': {
    rid: 'ri.language-model-service..language-model.grok-420-reasoning-latest',
    modelIdentifier: 'GROK_420_REASONING_LATEST',
    displayName: 'Grok 420 Reasoning Latest',
    lifecycle: 'ga',
    inputTypes: ['X_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
    },
    trainingCutoffDate: '2026-01-01T00:00:00Z',
    modelCreator: 'X_AI',
    transport: 'xai-responses',
  },
  'grok-build-0-1': {
    rid: 'ri.language-model-service..language-model.grok-build-0-1',
    modelIdentifier: 'GROK_BUILD_0_1',
    displayName: 'Grok Build 0.1',
    lifecycle: 'ga',
    inputTypes: ['X_AI_RESPONSES', 'GENERIC_VISION_COMPLETION'],
    performance: {
      cost: 'MEDIUM',
      modelClass: 'LIGHTWEIGHT',
    },
    trainingCutoffDate: '2025-03-17T00:00:00Z',
    externalUrl: 'https://x.ai/news/grok-build-0-1',
    modelCreator: 'X_AI',
    transport: 'xai-responses',
  },
} as const satisfies Record<string, ModelDefinition>;

export const XAI_MODELS = createProviderModelCatalog('xai', XAI_MODEL_DEFINITIONS);
export type KnownXaiModelId = keyof typeof XAI_MODELS;
export type XaiModelId = KnownXaiModelId | (string & {});
export const XAI_MODEL_IDS = Object.freeze(Object.keys(XAI_MODELS)) as readonly KnownXaiModelId[];
