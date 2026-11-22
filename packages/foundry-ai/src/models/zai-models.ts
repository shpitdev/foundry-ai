import type { ModelDefinition } from '../types.js';
import { catalogModelIds, createProviderModelCatalog } from './metadata.js';

const ZAI_MODEL_DEFINITIONS = {
  'glm-5': {
    rid: 'ri.language-model-service..language-model.glm-5',
    modelIdentifier: 'GLM_5',
    displayName: 'Z.ai GLM-5',
    lifecycle: 'ga',
    inputTypes: ['GENERIC_CHAT_COMPLETION'],
    performance: { cost: 'MEDIUM', modelClass: 'REASONING', speed: 'MEDIUM' },
    externalUrl: 'https://z.ai/blog/glm-5',
    modelCreator: 'Z_AI',
  },
  'glm-5.3': {
    rid: 'ri.language-model-service..language-model.glm-5-3',
    modelIdentifier: 'GLM_5_3',
    displayName: 'Z.ai GLM-5.3',
    lifecycle: 'ga',
    inputTypes: ['GENERIC_CHAT_COMPLETION'],
    performance: { cost: 'MEDIUM', modelClass: 'REASONING', speed: 'MEDIUM' },
    externalUrl: 'https://huggingface.co/zai-org/GLM-5.3',
    modelCreator: 'Z_AI',
  },
} as const satisfies Record<string, ModelDefinition>;

export const ZAI_MODELS = createProviderModelCatalog('zai', ZAI_MODEL_DEFINITIONS);
export type KnownZaiModelId = keyof typeof ZAI_MODELS;
export type ZaiModelId = KnownZaiModelId | (string & Record<never, never>);
export const ZAI_MODEL_IDS = catalogModelIds(ZAI_MODELS);
