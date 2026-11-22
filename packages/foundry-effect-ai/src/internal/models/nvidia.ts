/** NVIDIA Nemotron models on Foundry's Chat route, by catalog alias. The adapter reads no flags. */
export const models = {
  'nemotron-3-super-120b': {
    rid: 'ri.language-model-service..language-model.nemotron-3-super-120b',
  },
  'nemotron-3-nano-30b': { rid: 'ri.language-model-service..language-model.nemotron-3-nano-30b' },
  'nemotron-3-ultra-550b': {
    rid: 'ri.language-model-service..language-model.nemotron-3-ultra-550b-a55b-nvfp4',
  },
} as const;
