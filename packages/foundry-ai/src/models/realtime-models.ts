import type { ModelDefinition } from '../types.js';
import { createProviderModelCatalog } from './metadata.js';

const definitions = {
  'gpt-realtime': {
    rid: 'ri.language-model-service..language-model.gpt-realtime',
    modelIdentifier: 'GPT_REALTIME',
    displayName: 'GPT Realtime',
    lifecycle: 'experimental',
    inputTypes: ['OPEN_AI_REALTIME'],
    trainingCutoffDate: '2023-10-01T00:00:00Z',
    performance: { cost: 'HIGH', modelClass: 'HEAVYWEIGHT', speed: 'HIGH' },
    externalUrl: 'https://platform.openai.com/docs/models/gpt-realtime',
  },
  'gpt-realtime-1.5': {
    rid: 'ri.language-model-service..language-model.gpt-realtime-1-5',
    modelIdentifier: 'GPT_REALTIME_1_5',
    displayName: 'GPT Realtime 1.5',
    lifecycle: 'experimental',
    inputTypes: ['OPEN_AI_REALTIME'],
    trainingCutoffDate: '2024-09-30T00:00:00Z',
    performance: { cost: 'HIGH', modelClass: 'HEAVYWEIGHT', speed: 'HIGH' },
    externalUrl: 'https://developers.openai.com/api/docs/models/gpt-realtime-1.5',
  },
  'gpt-realtime-2': {
    rid: 'ri.language-model-service..language-model.gpt-realtime-2',
    modelIdentifier: 'GPT_REALTIME_2',
    displayName: 'GPT Realtime 2',
    lifecycle: 'experimental',
    inputTypes: ['OPEN_AI_REALTIME'],
    trainingCutoffDate: '2024-09-30T00:00:00Z',
    performance: { cost: 'HIGH', modelClass: 'HEAVYWEIGHT', speed: 'HIGH' },
    externalUrl: 'https://developers.openai.com/api/docs/models/gpt-realtime-2',
  },
} as const satisfies Record<string, ModelDefinition>;

export type RealtimeModelId = keyof typeof definitions;
export const REALTIME_MODELS = createProviderModelCatalog('openai', definitions);
export const REALTIME_MODEL_IDS = Object.keys(definitions) as RealtimeModelId[];
