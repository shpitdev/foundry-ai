import type { ModelDefinition } from '../types.js';
import { createProviderModelCatalog } from './metadata.js';

const ANTHROPIC_MODEL_DEFINITIONS = {
  'claude-haiku-4.5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-5-haiku',
    modelIdentifier: 'ANTHROPIC_CLAUDE_45_HAIKU',
    displayName: 'Claude Haiku 4.5',
    lifecycle: 'ga',
    inputTypes: [
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
      'CLAUDE_CHAT',
    ],
    trainingCutoffDate: '2025-07-01T00:00:00Z',
    performance: {
      cost: 'LOW',
      modelClass: 'LIGHTWEIGHT',
      speed: 'HIGH',
    },
    externalUrl: 'https://www.anthropic.com/news/claude-haiku-4-5',
  },
  'claude-opus-4.5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-5-opus',
    modelIdentifier: 'ANTHROPIC_CLAUDE_45_OPUS',
    displayName: 'Claude Opus 4.5',
    lifecycle: 'ga',
    inputTypes: [
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
      'CLAUDE_CHAT',
    ],
    trainingCutoffDate: '2025-08-01T00:00:00Z',
    performance: {
      cost: 'HIGH',
      modelClass: 'HEAVYWEIGHT',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://www.anthropic.com/news/claude-opus-4-5',
  },
  'claude-opus-4.6': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-6-opus',
    modelIdentifier: 'ANTHROPIC_CLAUDE_46_OPUS',
    displayName: 'Claude Opus 4.6',
    lifecycle: 'ga',
    inputTypes: [
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
      'CLAUDE_CHAT',
    ],
    trainingCutoffDate: '2025-08-01T00:00:00Z',
    performance: {
      cost: 'HIGH',
      modelClass: 'HEAVYWEIGHT',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://www.anthropic.com/news/claude-opus-4-6',
  },
  'claude-opus-4.7': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-7-opus',
    modelIdentifier: 'ANTHROPIC_CLAUDE_47_OPUS',
    displayName: 'Claude Opus 4.7',
    lifecycle: 'ga',
    inputTypes: [
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
      'CLAUDE_CHAT',
    ],
    trainingCutoffDate: '2026-01-01T00:00:00Z',
    performance: {
      cost: 'HIGH',
      modelClass: 'HEAVYWEIGHT',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://www.anthropic.com/news/claude-opus-4-7',
  },
  'claude-opus-4.8': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-8-opus',
    modelIdentifier: 'ANTHROPIC_CLAUDE_48_OPUS',
    displayName: 'Claude Opus 4.8',
    lifecycle: 'ga',
    inputTypes: [
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
      'CLAUDE_CHAT',
    ],
    trainingCutoffDate: '2026-01-01T00:00:00Z',
    performance: {
      cost: 'HIGH',
      modelClass: 'HEAVYWEIGHT',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://www.anthropic.com/news/claude-opus-4-8',
  },
  'claude-opus-5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-5-opus',
    modelIdentifier: 'ANTHROPIC_CLAUDE_5_OPUS',
    displayName: 'Claude Opus 5',
    lifecycle: 'ga',
    inputTypes: [
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
      'CLAUDE_CHAT',
    ],
    trainingCutoffDate: '2026-05-01T00:00:00Z',
    performance: {
      cost: 'HIGH',
      modelClass: 'HEAVYWEIGHT',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://www.anthropic.com/news/claude-opus-5',
  },
  // Always uses adaptive thinking; the proxy rejects budget-based thinking for this model.
  'claude-opus-5.5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-5-5-opus',
    modelIdentifier: 'ANTHROPIC_CLAUDE_55_OPUS',
    displayName: 'Claude Opus 5.5',
    lifecycle: 'ga',
    inputTypes: [
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
      'CLAUDE_CHAT',
    ],
    trainingCutoffDate: '2026-06-01T00:00:00Z',
    performance: {
      cost: 'HIGH',
      modelClass: 'HEAVYWEIGHT',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://www.anthropic.com/claude-opus-5-5',
  },
  'claude-sonnet-4.5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-5-sonnet',
    modelIdentifier: 'ANTHROPIC_CLAUDE_45_SONNET',
    displayName: 'Claude Sonnet 4.5',
    lifecycle: 'ga',
    inputTypes: [
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
      'CLAUDE_CHAT',
    ],
    trainingCutoffDate: '2025-07-01T00:00:00Z',
    performance: {
      cost: 'MEDIUM',
      modelClass: 'HEAVYWEIGHT',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://www.anthropic.com/news/claude-sonnet-4-5',
  },
  'claude-sonnet-4.6': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-6-sonnet',
    modelIdentifier: 'ANTHROPIC_CLAUDE_46_SONNET',
    displayName: 'Claude Sonnet 4.6',
    lifecycle: 'ga',
    inputTypes: [
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
      'CLAUDE_CHAT',
    ],
    trainingCutoffDate: '2025-08-01T00:00:00Z',
    performance: {
      cost: 'MEDIUM',
      modelClass: 'HEAVYWEIGHT',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://www.anthropic.com/news/claude-sonnet-4-6',
  },
  'claude-sonnet-5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-5-sonnet',
    modelIdentifier: 'ANTHROPIC_CLAUDE_5_SONNET',
    displayName: 'Claude Sonnet 5',
    lifecycle: 'ga',
    inputTypes: [
      'GENERIC_COMPLETION',
      'GENERIC_CHAT_COMPLETION',
      'GENERIC_VISION_COMPLETION',
      'CLAUDE_CHAT',
    ],
    trainingCutoffDate: '2026-01-01T00:00:00Z',
    performance: {
      cost: 'MEDIUM',
      modelClass: 'HEAVYWEIGHT',
      speed: 'MEDIUM',
    },
    externalUrl: 'https://www.anthropic.com/news/claude-sonnet-5',
  },
} as const satisfies Record<string, ModelDefinition>;

export const ANTHROPIC_MODELS = createProviderModelCatalog(
  'anthropic',
  ANTHROPIC_MODEL_DEFINITIONS,
);

export type KnownAnthropicModelId = keyof typeof ANTHROPIC_MODELS;
export type AnthropicModelId = KnownAnthropicModelId | (string & {});

export const ANTHROPIC_MODEL_IDS = Object.freeze(
  Object.keys(ANTHROPIC_MODELS),
) as readonly KnownAnthropicModelId[];
