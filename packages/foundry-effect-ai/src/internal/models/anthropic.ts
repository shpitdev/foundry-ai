/**
 * Anthropic models on Foundry, by catalog alias. `maxOutputTokens` is the default `max_tokens`;
 * `nativeJson` marks models that reject forced tool use, so structured output is sent as
 * `output_config.format` instead of a forced JSON tool.
 */
export const models = {
  'claude-haiku-4.5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-5-haiku',
    maxOutputTokens: 64_000,
  },
  'claude-haiku-5.5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-5-5-haiku',
    maxOutputTokens: 128_000,
  },
  'claude-opus-4.5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-5-opus',
    maxOutputTokens: 64_000,
  },
  'claude-opus-4.6': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-6-opus',
    maxOutputTokens: 128_000,
  },
  'claude-opus-4.7': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-7-opus',
    maxOutputTokens: 128_000,
  },
  'claude-opus-4.8': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-8-opus',
    maxOutputTokens: 128_000,
  },
  'claude-opus-5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-5-opus',
    maxOutputTokens: 128_000,
  },
  'claude-opus-5.5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-5-5-opus',
    maxOutputTokens: 128_000,
    nativeJson: true,
  },
  'claude-sonnet-4.5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-5-sonnet',
    maxOutputTokens: 64_000,
  },
  'claude-sonnet-4.6': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-4-6-sonnet',
    maxOutputTokens: 128_000,
  },
  'claude-sonnet-5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-5-sonnet',
    maxOutputTokens: 128_000,
  },
  'claude-sonnet-5.5': {
    rid: 'ri.language-model-service..language-model.anthropic-claude-5-5-sonnet',
    maxOutputTokens: 128_000,
    nativeJson: true,
  },
} as const;
