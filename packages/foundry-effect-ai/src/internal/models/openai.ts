/** OpenAI models on Foundry, by catalog alias. Each phase adds the models and flags it reads. */
export const models = {
  'gpt-6-luna': { rid: 'ri.language-model-service..language-model.gpt-6-luna' },
} as const;

/** OpenAI embedding models, whose RIDs equal their names, with their native vector size. */
export const embeddingModels = {
  'text-embedding-ada-002': { dimensions: 1536 },
  'text-embedding-3-small': { dimensions: 1536 },
  'text-embedding-3-large': { dimensions: 3072 },
} as const;
