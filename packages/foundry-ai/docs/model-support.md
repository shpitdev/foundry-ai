# Model Support

`@nyrra/foundry-ai` exposes language-model entrypoints for OpenAI, Anthropic, and Google, plus OpenAI embeddings. Image generation, speech, transcription, video, and rerank methods remain out of scope.

## Provider summary

| Provider | Package import | Foundry proxy family | Default live model | Notes |
|---|---|---|---|---|
| OpenAI | `@nyrra/foundry-ai/openai` | `/api/v2/llm/proxy/openai/v1` | `gpt-5-nano` | Uses Responses-compatible language transport and the OpenAI embeddings proxy |
| Anthropic | `@nyrra/foundry-ai/anthropic` | `/api/v2/llm/proxy/anthropic/v1` | `claude-haiku-4.5` | Uses bearer auth and disables unsupported eager tool streaming |
| Google | `@nyrra/foundry-ai/google` | `/api/v2/llm/proxy/google/v1` | `gemini-3.1-flash-lite` | Beta Foundry proxy surface with bearer-auth rewrite |

## Known aliases

### OpenAI

- `gpt-4.1`
- `gpt-4.1-mini`
- `gpt-4.1-nano`
- `gpt-4o`
- `gpt-5`
- `gpt-5-pro`
- `gpt-5-codex`
- `gpt-5-mini`
- `gpt-5-nano`
- `gpt-5.1`
- `gpt-5.1-codex`
- `gpt-5.1-codex-mini`
- `gpt-5.2`
- `gpt-5.3-codex`
- `gpt-5.4`
- `gpt-5.5`
- `gpt-5.6-sol`
- `gpt-5.6-terra`
- `gpt-5.6-luna`
- `gpt-5.4-mini`
- `gpt-5.4-nano`
- `o3`
- `o4-mini`

OpenAI embedding aliases:

- `text-embedding-3-small`
- `text-embedding-3-large`

### Anthropic

- `claude-3.5-haiku`
- `claude-3.7-sonnet`
- `claude-haiku-4.5`
- `claude-opus-4`
- `claude-opus-4.1`
- `claude-opus-4.5`
- `claude-opus-4.6`
- `claude-opus-4.7`
- `claude-opus-4.8`
- `claude-opus-5`
- `claude-sonnet-4`
- `claude-sonnet-4.5`
- `claude-sonnet-4.6`
- `claude-sonnet-5`

### Google

- `gemini-2.5-pro`
- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`
- `gemini-3-flash`
- `gemini-3.1-pro`
- `gemini-3.1-flash-lite`
- `gemini-3.5-flash`
- `gemini-3.5-flash-lite`
- `gemini-3.6-flash`

## Supported model ID patterns

- Known aliases resolve to the package catalog and then to Foundry RIDs.
- `gpt-5-pro` and `gpt-5.3-codex` are Responses-API-only, consistent with this package's OpenAI Responses transport.
- Raw Foundry RIDs pass through unchanged when you call a provider factory directly.
- OpenAI embeddings are distinct from language-model RID routing: the typed aliases `text-embedding-3-small` and `text-embedding-3-large` resolve to themselves, and any other plain model string passes through unchanged to the embeddings proxy.
- Reverse RID lookup is available through `MODEL_CATALOG_BY_RID` and catalog helpers from the root entrypoint.
- Sunset and deprecated enrollment entries are excluded from the public alias catalog.

## Catalog metadata

`getModelMetadata()` and the exported catalog objects now carry normalized metadata for each current alias:

- `modelIdentifier`
- `inputTypes`
- `trainingCutoffDate`
- `performance.cost`
- `performance.modelClass`
- `performance.speed`
- `externalUrl`
- derived `supportsVision`
- derived `supportsResponses`

## Important behavior notes

- OpenAI traffic always sets `providerOptions.openai.store = false`.
- OpenAI embeddings use `openai.embeddingModel()` or `openai.embedding()` with AI SDK `embed` and `embedMany`.
- Setting `providerOptions.openai.store = true` throws before the request is sent.
- Known OpenAI reasoning aliases automatically get `forceReasoning = true` unless the caller already set it.
- Anthropic requests set `toolStreaming = false` and use JSON-tool structured output because the Foundry proxy rejects eager tool streaming and does not enable Anthropic's native `output_config.format` backend.
- Google support should be treated as beta until the Foundry proxy contract is more stable.
- Multi-provider routing belongs in application code, not this package.

## Live verification

The checked-in [harness capability results](./harness-capability-results.md) are the canonical model-by-capability record from the live verification harness.

Catalog metadata comes from live Foundry enrollment records. The checked-in capability snapshot can lag newly enrolled aliases until the next full-catalog harness run.

The current snapshot shows:

- OpenAI hard-gate model: `gpt-5-nano`
- Anthropic hard-gate model: `claude-haiku-4.5`
- Google hard-gate model: `gemini-3.1-flash-lite`

For the latest row-by-row pass/fail details, use the matrix rather than guessing from this summary doc.
