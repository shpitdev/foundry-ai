/** xAI models on Foundry, by catalog alias. Each phase adds the flags it reads. */
export const models = {
  'grok-4-3': { rid: 'ri.language-model-service..language-model.grok-4-3' },
  'grok-4-5': { rid: 'ri.language-model-service..language-model.grok-4-5' },
  'grok-4-6': { rid: 'ri.language-model-service..language-model.grok-4-6' },
  'grok-4-7': { rid: 'ri.language-model-service..language-model.grok-4-7' },
  'grok-420-non-reasoning-latest': {
    rid: 'ri.language-model-service..language-model.grok-420-non-reasoning-latest',
  },
  'grok-420-reasoning-latest': {
    rid: 'ri.language-model-service..language-model.grok-420-reasoning-latest',
  },
  'grok-build-0-1': { rid: 'ri.language-model-service..language-model.grok-build-0-1' },
} as const;
