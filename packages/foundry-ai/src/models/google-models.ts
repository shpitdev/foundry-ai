import type { ModelDefinition } from '../types.js';
import { createProviderModelCatalog } from './metadata.js';

const GOOGLE_MODEL_DEFINITIONS = {
  'gemini-4-argon': {
    rid: 'ri.language-model-service..language-model.gemini-4-argon',
    modelIdentifier: 'GEMINI_4_ARGON',
    displayName: 'Gemini 4 Argon',
    lifecycle: 'ga',
    inputTypes: ['GEMINI_CHAT', 'GENERIC_VISION_COMPLETION'],
    trainingCutoffDate: '2026-03-01T00:00:00Z',
    performance: { cost: 'MEDIUM', modelClass: 'REASONING', speed: 'MEDIUM' },
    externalUrl:
      'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-argon',
  },
  'gemini-4-carbon': {
    rid: 'ri.language-model-service..language-model.gemini-4-carbon',
    modelIdentifier: 'GEMINI_4_CARBON',
    displayName: 'Gemini 4 Carbon (Experimental)',
    lifecycle: 'experimental',
    inputTypes: ['GEMINI_CHAT', 'GENERIC_VISION_COMPLETION'],
    trainingCutoffDate: '2026-03-01T00:00:00Z',
    performance: { cost: 'MEDIUM', modelClass: 'REASONING', speed: 'MEDIUM' },
    externalUrl:
      'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-carbon',
  },
  'gemini-4-hydrogen': {
    rid: 'ri.language-model-service..language-model.gemini-4-hydrogen',
    modelIdentifier: 'GEMINI_4_HYDROGEN',
    displayName: 'Gemini 4 Hydrogen',
    lifecycle: 'experimental',
    inputTypes: ['GEMINI_CHAT', 'GENERIC_VISION_COMPLETION'],
    trainingCutoffDate: '2026-03-01T00:00:00Z',
    performance: { cost: 'MEDIUM', modelClass: 'REASONING', speed: 'HIGH' },
    externalUrl:
      'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/4-hydrogen',
  },
  'gemini-3.8-flash': {
    rid: 'ri.language-model-service..language-model.gemini-3-8-flash',
    modelIdentifier: 'GEMINI_3_8_FLASH',
    displayName: 'Gemini 3.8 Flash',
    lifecycle: 'ga',
    inputTypes: ['GEMINI_CHAT', 'GENERIC_VISION_COMPLETION'],
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
      speed: 'HIGH',
    },
    trainingCutoffDate: '2026-03-01T00:00:00Z',
    externalUrl:
      'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-8-flash',
  },
  'gemini-3-flash': {
    rid: 'ri.language-model-service..language-model.gemini-3-flash',
    modelIdentifier: 'GEMINI_3_FLASH',
    displayName: 'Gemini 3 Flash (Preview)',
    lifecycle: 'ga',
    inputTypes: [
      'GEMINI_CHAT',
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
    ],
    trainingCutoffDate: '2025-01-01T00:00:00Z',
    performance: {
      cost: 'LOW',
      modelClass: 'LIGHTWEIGHT',
      speed: 'HIGH',
    },
    externalUrl: 'https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-flash',
  },
  'gemini-3.1-pro': {
    rid: 'ri.language-model-service..language-model.gemini-3-1-pro',
    modelIdentifier: 'GEMINI_3_1_PRO',
    displayName: 'Gemini 3.1 Pro (Preview)',
    lifecycle: 'ga',
    inputTypes: [
      'GEMINI_CHAT',
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
    ],
    trainingCutoffDate: '2025-01-01T00:00:00Z',
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-1-pro',
  },
  'gemini-3.1-flash-lite': {
    rid: 'ri.language-model-service..language-model.gemini-3-1-flash-lite',
    modelIdentifier: 'GEMINI_3_1_FLASH_LITE',
    displayName: 'Gemini 3.1 Flash Lite',
    lifecycle: 'ga',
    inputTypes: [
      'GEMINI_CHAT',
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
    ],
    trainingCutoffDate: '2025-01-01T00:00:00Z',
    performance: {
      cost: 'LOW',
      modelClass: 'LIGHTWEIGHT',
      speed: 'HIGH',
    },
    externalUrl: 'https://deepmind.google/models/model-cards/gemini-3-1-flash-lite/',
  },
  'gemini-3.5-flash': {
    rid: 'ri.language-model-service..language-model.gemini-3-5-flash',
    modelIdentifier: 'GEMINI_3_5_FLASH',
    displayName: 'Gemini 3.5 Flash',
    lifecycle: 'ga',
    inputTypes: [
      'GEMINI_CHAT',
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
    ],
    trainingCutoffDate: '2025-01-01T00:00:00Z',
    performance: {
      cost: 'MEDIUM',
      modelClass: 'REASONING',
      speed: 'HIGH',
    },
    externalUrl:
      'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash',
  },
  'gemini-3.5-flash-lite': {
    rid: 'ri.language-model-service..language-model.gemini-3-5-flash-lite',
    modelIdentifier: 'GEMINI_3_5_FLASH_LITE',
    displayName: 'Gemini 3.5 Flash-Lite',
    lifecycle: 'ga',
    inputTypes: [
      'GEMINI_CHAT',
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
    ],
    trainingCutoffDate: '2026-01-01T00:00:00Z',
    performance: {
      cost: 'LOW',
      modelClass: 'LIGHTWEIGHT',
      speed: 'HIGH',
    },
    externalUrl:
      'https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/3-5-flash-lite',
  },
} as const satisfies Record<string, ModelDefinition>;

export const GOOGLE_MODELS = createProviderModelCatalog('google', GOOGLE_MODEL_DEFINITIONS);

export type KnownGoogleModelId = keyof typeof GOOGLE_MODELS;
export type GoogleModelId = KnownGoogleModelId | (string & {});

export const GOOGLE_MODEL_IDS = Object.freeze(
  Object.keys(GOOGLE_MODELS),
) as readonly KnownGoogleModelId[];
