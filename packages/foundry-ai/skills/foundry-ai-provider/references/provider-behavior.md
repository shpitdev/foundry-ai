# Provider Behavior

## Dependencies

- OpenAI: `@nyrra/foundry-ai`, `ai`, `@ai-sdk/openai`
- Anthropic: `@nyrra/foundry-ai`, `ai`, `@ai-sdk/anthropic`
- Google: `@nyrra/foundry-ai`, `ai`, `@ai-sdk/google`
- Multi-provider app: install only the peers you actually route to
- Match AI SDK 6 with provider packages v3, or AI SDK 7 with provider packages v4.
- Supported ranges:
  - `ai`: `^6.0.141 || ^7.0.0-beta.187`
  - `@ai-sdk/openai`: `^3.0.49 || ^4.0.0-beta.77`
  - `@ai-sdk/anthropic`: `^3.0.64 || ^4.0.0-beta.69`
  - `@ai-sdk/google`: `^3.0.54 || ^4.0.0-beta.85`

## Model routing

- Known aliases resolve through the shared package catalog.
- Raw Foundry RIDs pass through unchanged when you call a provider factory directly.
- Use application code for multi-provider routing. There is no package-level registry helper.
- Good current starting aliases are `gpt-5.6-terra`, `claude-sonnet-5`, and `gemini-3.6-flash`.
- Use `getModelMetadata()` when cost, speed, model class, cutoff date, or vision support should drive model selection.

## OpenAI

- Uses Foundry's OpenAI proxy base URL.
- Always sends `providerOptions.openai.store = false`.
- Throws early when a caller sets `providerOptions.openai.store = true`.
- Automatically sets `forceReasoning = true` for known OpenAI reasoning aliases unless the caller already set it.
- Defaults function tools to `strict = true` only when the caller left `strict` unspecified.
- Exposes `embeddingModel()` and `embedding()` with typed aliases for `text-embedding-3-small` and `text-embedding-3-large`; other plain OpenAI model strings pass through unchanged because embeddings do not use Foundry RID routing.

## Anthropic

- Uses bearer auth through the Anthropic SDK's `authToken` path.
- Sets `toolStreaming = false` and `structuredOutputMode = 'jsonTool'` because Foundry rejects eager tool streaming and Anthropic native structured output.
- Rejects explicit `toolStreaming = true` and tool-level `providerOptions.anthropic.eagerInputStreaming = true` before sending a request.
- Preserves other Anthropic provider options.
- With `@ai-sdk/anthropic ^3.0.96 || ^4.0.0-beta.69`, request visible Claude 5 reasoning with `thinking: { type: 'adaptive', display: 'summarized' }`, `effort: 'high'`, and `sendReasoning: true`. Earlier supported v3 releases do not expose the `display` option.

## Google

- Uses Foundry's beta Google-compatible proxy.
- Rewrites the AI SDK's `x-goog-api-key` header into `Authorization: Bearer`.
- Should be treated as less stable than the OpenAI and Anthropic paths.

## Unsupported surfaces

- Anthropic and Google embeddings
- image generation
- speech
- transcription
- video
- rerank
