import type { ModelDefinition } from '../types.js';
import { createProviderModelCatalog } from './metadata.js';

const definitions = {
  'gpt-realtime': {
    rid: 'ri.language-model-service..language-model.gpt-realtime',
    modelIdentifier: 'GPT_REALTIME',
    displayName: 'GPT Realtime',
    lifecycle: 'experimental',
    inputTypes: ['OPEN_AI_REALTIME'],
    performance: { cost: 'HIGH', modelClass: 'HEAVYWEIGHT', speed: 'HIGH' },
  },
  'gpt-realtime-1.5': {
    rid: 'ri.language-model-service..language-model.gpt-realtime-1-5',
    modelIdentifier: 'GPT_REALTIME_1_5',
    displayName: 'GPT Realtime 1.5',
    lifecycle: 'experimental',
    inputTypes: ['OPEN_AI_REALTIME'],
    performance: { cost: 'HIGH', modelClass: 'HEAVYWEIGHT', speed: 'HIGH' },
  },
  'gpt-realtime-2': {
    rid: 'ri.language-model-service..language-model.gpt-realtime-2',
    modelIdentifier: 'GPT_REALTIME_2',
    displayName: 'GPT Realtime 2',
    lifecycle: 'experimental',
    inputTypes: ['OPEN_AI_REALTIME'],
    performance: { cost: 'HIGH', modelClass: 'HEAVYWEIGHT', speed: 'HIGH' },
  },
} as const satisfies Record<string, ModelDefinition>;

export type RealtimeModelId = keyof typeof definitions;
export const REALTIME_MODELS = createProviderModelCatalog('openai', definitions);
export const REALTIME_MODEL_IDS = Object.keys(definitions) as RealtimeModelId[];
