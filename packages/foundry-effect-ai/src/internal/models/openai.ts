/**
 * OpenAI models on Foundry, by catalog alias. `reasoning` marks models that take developer
 * messages and return encrypted reasoning for stateless replay; `decisions` marks models that
 * serve `/openai/v1/decisions`; `chatToolsNeedNoReasoning` marks models whose Chat Completions
 * route accepts function tools only with `reasoning_effort: 'none'`. Each phase adds the models
 * and flags it reads.
 */
export const models = {
  'gpt-4.1': { rid: 'ri.language-model-service..language-model.gpt-4-1' },
  'gpt-4.1-mini': { rid: 'ri.language-model-service..language-model.gpt-4-1-mini' },
  'gpt-4.1-nano': { rid: 'ri.language-model-service..language-model.gpt-4-1-nano' },
  'gpt-5': { rid: 'ri.language-model-service..language-model.gpt-5', reasoning: true },
  'gpt-5-codex': { rid: 'ri.language-model-service..language-model.gpt-5-codex' },
  'gpt-5-mini': { rid: 'ri.language-model-service..language-model.gpt-5-mini', reasoning: true },
  'gpt-5-nano': { rid: 'ri.language-model-service..language-model.gpt-5-nano', reasoning: true },
  'gpt-5.1': { rid: 'ri.language-model-service..language-model.gpt-5-1' },
  'gpt-5.1-codex': { rid: 'ri.language-model-service..language-model.gpt-5-1-codex' },
  'gpt-5.1-codex-mini': { rid: 'ri.language-model-service..language-model.gpt-5-1-codex-mini' },
  'gpt-5.2': { rid: 'ri.language-model-service..language-model.gpt-5-2', reasoning: true },
  'gpt-5.3-codex': { rid: 'ri.language-model-service..language-model.gpt-5-3-codex' },
  'gpt-5.4': { rid: 'ri.language-model-service..language-model.gpt-5-4', reasoning: true },
  'gpt-5.5': { rid: 'ri.language-model-service..language-model.gpt-5-5', reasoning: true },
  'gpt-5.6-sol': { rid: 'ri.language-model-service..language-model.gpt-5-6-sol', reasoning: true },
  'gpt-5.6-terra': {
    rid: 'ri.language-model-service..language-model.gpt-5-6-terra',
    reasoning: true,
  },
  'gpt-5.6-luna': {
    rid: 'ri.language-model-service..language-model.gpt-5-6-luna',
    reasoning: true,
  },
  'gpt-6-astra': { rid: 'ri.language-model-service..language-model.gpt-6-astra', reasoning: true },
  'gpt-6-luna': {
    rid: 'ri.language-model-service..language-model.gpt-6-luna',
    reasoning: true,
    decisions: true,
    chatToolsNeedNoReasoning: true,
  },
  'gpt-6-sol': {
    rid: 'ri.language-model-service..language-model.gpt-6-sol',
    reasoning: true,
    chatToolsNeedNoReasoning: true,
  },
  'gpt-6.1-sol': { rid: 'ri.language-model-service..language-model.gpt-6-1-sol', reasoning: true },
  'gpt-6.1-terra': {
    rid: 'ri.language-model-service..language-model.gpt-6-1-terra',
    reasoning: true,
    chatToolsNeedNoReasoning: true,
  },
  'gpt-5.4-mini': {
    rid: 'ri.language-model-service..language-model.gpt-5-4-mini',
    reasoning: true,
  },
  'gpt-5.4-nano': {
    rid: 'ri.language-model-service..language-model.gpt-5-4-nano',
    reasoning: true,
  },
} as const;

/** OpenAI embedding models, whose RIDs equal their names, with their native vector size. */
export const embeddingModels = {
  'text-embedding-ada-002': { dimensions: 1536 },
  'text-embedding-3-small': { dimensions: 1536 },
  'text-embedding-3-large': { dimensions: 3072 },
} as const;
