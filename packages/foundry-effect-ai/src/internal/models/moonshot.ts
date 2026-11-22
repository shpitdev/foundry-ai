/** Moonshot Kimi models on Foundry's Chat route, by catalog alias. The adapter reads no flags. */
export const models = {
  'kimi-k3.1-pro-highspeed': {
    rid: 'ri.language-model-service..language-model.kimi-k3-1-pro-highspeed',
  },
  'kimi-k3': { rid: 'ri.language-model-service..language-model.kimi-k3' },
  'kimi-k2.5': { rid: 'ri.language-model-service..language-model.kimi-k2-5' },
} as const;
