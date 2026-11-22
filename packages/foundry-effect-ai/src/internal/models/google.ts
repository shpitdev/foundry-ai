/** Gemini models on Foundry, by catalog alias. The adapter reads no flags yet. */
export const models = {
  'gemini-4-argon': { rid: 'ri.language-model-service..language-model.gemini-4-argon' },
  'gemini-4-carbon': { rid: 'ri.language-model-service..language-model.gemini-4-carbon' },
  'gemini-4-hydrogen': { rid: 'ri.language-model-service..language-model.gemini-4-hydrogen' },
  'gemini-4-neon': { rid: 'ri.language-model-service..language-model.gemini-4-neon' },
  'gemini-3.8-flash': { rid: 'ri.language-model-service..language-model.gemini-3-8-flash' },
  'gemini-3-flash': { rid: 'ri.language-model-service..language-model.gemini-3-flash' },
  'gemini-3.1-pro': { rid: 'ri.language-model-service..language-model.gemini-3-1-pro' },
  'gemini-3.1-flash-lite': {
    rid: 'ri.language-model-service..language-model.gemini-3-1-flash-lite',
  },
  'gemini-3.5-flash': { rid: 'ri.language-model-service..language-model.gemini-3-5-flash' },
  'gemini-3.5-flash-lite': {
    rid: 'ri.language-model-service..language-model.gemini-3-5-flash-lite',
  },
} as const;
