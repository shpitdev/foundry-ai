# @nyrra/foundry-ai Specification

## Summary

`@nyrra/foundry-ai` is a small TypeScript package that adapts Palantir Foundry LLM proxy endpoints to the Vercel AI SDK. The package is intentionally thin:

- stable provider factories for OpenAI and Anthropic
- a shared alias-to-RID catalog with reverse RID lookup
- a beta Google provider factory backed by an explicit RID catalog
- no published registry helper
- explicit handling for known Foundry OpenAI compatibility gaps

The package does not try to invent a separate request API. Callers should continue using standard AI SDK `generateText`, `streamText`, `providerOptions`, tools, and structured output flows.

## Published API

### Root entrypoint

`@nyrra/foundry-ai` exports:

- `loadFoundryConfig()`
- `FoundryModelNotFoundError`
- `MODEL_CATALOG`
- `MODEL_CATALOG_BY_RID`
- `getModelMetadata()`
- `hasKnownModel()`
- `resolveKnownModelMetadata()`
- `resolveModelProvider()`
- `resolveModelRid()`
- `resolveModelTarget()`
- type exports for `FoundryConfig`, `OpenAIModelId`, `OpenAIEmbeddingModelId`, `AnthropicModelId`, `GoogleModelId`, `KnownOpenAIModelId`, `KnownOpenAIEmbeddingModelId`, `KnownAnthropicModelId`, `KnownGoogleModelId`, `KnownModelId`, `ModelDefinition`, `ModelMetadata`, `ModelInputType`, `ModelPerformance`, `ModelCost`, `ModelClass`, `ModelSpeed`, `ModelProvider`, `ModelLifecycle`, and `ResolvedModelTarget`

### Provider entrypoints

- `@nyrra/foundry-ai/openai` exports `createFoundryOpenAI`
- `@nyrra/foundry-ai/anthropic` exports `createFoundryAnthropic`
- `@nyrra/foundry-ai/google` exports `createFoundryGoogle`

There is no `@nyrra/foundry-ai/registry` export. Multi-provider routing belongs in application code with AI SDK `createProviderRegistry`.
The package is still pre-1.0, and the thin-adapter contract intentionally removes the older registry, middleware, and formatter helper exports instead of preserving them behind compatibility shims.

## Provider Behavior

### Shared behavior

- All providers validate `foundryUrl` and `token` at runtime.
- All providers normalize trailing slashes in `foundryUrl`.
- OpenAI, Anthropic, and Google friendly aliases are resolved through the shared RID catalog.
- Wrapped models expose the caller-facing alias as `model.modelId` when an alias was used.
- Provider and middleware specification versions follow the installed AI SDK generation: v3 for AI SDK v6 and v4 for AI SDK v7.

### OpenAI-specific behavior

Foundry OpenAI requires minimal compatibility handling because the underlying SDK sees opaque RIDs instead of OpenAI model IDs.

- The adapter always sends `providerOptions.openai.store = false`.
- If a caller explicitly sets `providerOptions.openai.store = true`, the adapter throws a clear error before the request is sent.
- For catalogued OpenAI reasoning targets, the adapter adds `providerOptions.openai.forceReasoning = true` only when the caller did not already provide `forceReasoning`.
- OpenAI function tools default to `strict = true` only when the caller left `strict` unspecified. Explicit `strict` values are preserved.
- `embeddingModel()` and `embedding()` use the OpenAI-compatible `/embeddings` endpoint, which takes plain OpenAI model strings rather than Foundry RIDs. The typed convenience aliases `text-embedding-3-small` and `text-embedding-3-large` resolve to themselves, and any other model string passes through unchanged.

For uncatalogued OpenAI reasoning RIDs, the package cannot infer reasoning capability. Callers must set `providerOptions.openai.forceReasoning = true` explicitly when needed.

### Anthropic-specific behavior

- The adapter uses `authToken`, not `apiKey`, so requests go out as `Authorization: Bearer`.
- The adapter disables Anthropic eager tool streaming because Foundry rejects the upstream `eager_input_streaming` request field.
- Structured output uses the Anthropic JSON-tool fallback because Foundry does not enable the native `output_config.format` backend.
- Capability differences that vary by Foundry stack or model stay documented in examples and README instead of being guessed at runtime.

### Google-specific behavior

- The adapter targets Foundry's beta Google-compatible proxy under `/api/v2/llm/proxy/google/v1`.
- Known Gemini aliases resolve to explicit Foundry RIDs gathered from enrollment metadata.
- The underlying AI SDK provider expects `x-goog-api-key`, but Foundry requires bearer auth, so the adapter rewrites auth headers at fetch time to `Authorization: Bearer`.
- The adapter intentionally exposes only language-model methods. Image, embedding, and video methods throw `NoSuchModelError` until Foundry exposes compatible proxy endpoints for them.

Current Google alias-to-RID mappings:

- `gemini-2.5-pro` -> `ri.language-model-service..language-model.gemini-2-5-pro`
- `gemini-2.5-flash` -> `ri.language-model-service..language-model.gemini-2-5-flash`
- `gemini-2.5-flash-lite` -> `ri.language-model-service..language-model.gemini-2-5-flash-lite`
- `gemini-3-flash` -> `ri.language-model-service..language-model.gemini-3-flash`
- `gemini-3.1-pro` -> `ri.language-model-service..language-model.gemini-3-1-pro`
- `gemini-3.1-flash-lite` -> `ri.language-model-service..language-model.gemini-3-1-flash-lite`
- `gemini-3.5-flash` -> `ri.language-model-service..language-model.gemini-3-5-flash`
- `gemini-3.5-flash-lite` -> `ri.language-model-service..language-model.gemini-3-5-flash-lite`
- `gemini-3.6-flash` -> `ri.language-model-service..language-model.gemini-3-6-flash`

### xAI-specific behavior

- The Foundry xAI-compatible endpoints currently remain out of package scope.
- The active enrollment now includes licensed Grok models and verified Foundry RIDs, but the proxy contract still is not usable.
- We probed both `/api/v2/llm/proxy/xai/v1/chat/completions` and `/api/v2/llm/proxy/xai/v1/responses` on the active enrollment and they rejected documented request shapes during request deserialization with `LanguageModelService:InvalidRequest`.
- We also probed the OpenAI-compatible proxy with Grok RIDs and it returned `LanguageModelService:LanguageModelNotAvailable` with `Backend not supported for OpenAI proxy`.
- Keep xAI tracked as a spec item until the dedicated xAI proxy contract is usable end to end.

## Catalog Design

The public catalog is code-defined and normalized in separate provider files, but each provider file now uses one shared typed schema. We do not pipe raw Foundry JSON through the public API.

The normalized public metadata contains:

- `rid`
- `provider`
- `modelIdentifier`
- `displayName`
- `inputTypes`
- `trainingCutoffDate`
- `performance`
- `externalUrl`
- derived `supportsVision`
- derived `supportsResponses`
- `lifecycle`

Derived flags come from the normalized `inputTypes` list instead of hand-maintained booleans. OpenAI reasoning handling is also derived from `OPEN_AI_REASONING` rather than a manually curated model-ID set.

Behavior-driving compatibility flags still stay out of the public metadata contract unless they can be represented accurately and maintained reliably across providers.

Google is included in the shared catalog using enrollment-verified mappings. xAI remains intentionally excluded until the beta proxy contract is stable enough to document and verify consistently.
Enrolled models are not added automatically. The public catalog should include only current aliases the adapter surface can actually serve. Sunset and deprecated models are excluded entirely from the public catalog to avoid publishing typed aliases we do not want callers to adopt. That is why the catalog can lag enrollment for cases such as `o1`, where the active Foundry enrollment does not currently expose the responses-capable shape this package depends on.

## Example Registry Composition

Application code should compose multi-provider routing directly:

```ts
import { loadFoundryConfig } from '@nyrra/foundry-ai';
import { createFoundryAnthropic } from '@nyrra/foundry-ai/anthropic';
import { createFoundryOpenAI } from '@nyrra/foundry-ai/openai';
import { createProviderRegistry } from 'ai';

const config = loadFoundryConfig();
const registry = createProviderRegistry({
  anthropic: createFoundryAnthropic(config),
  openai: createFoundryOpenAI(config),
});
```

## Testing Requirements

- unit tests for config validation and normalization
- unit tests for alias and raw RID resolution
- unit tests for OpenAI compatibility defaults and explicit `store=true` failure
- unit tests for reverse RID lookup export
- unit tests for application-level `createProviderRegistry` composition using the public provider factories
- CI build and runtime specification checks against both supported AI SDK major generations
- live verification for direct OpenAI, Anthropic, and Google calls, plus registry composition via AI SDK
- targeted beta probing for xAI endpoint behavior and current failure modes on the active enrollment

## Harness Capability Results

The live suite in `packages/foundry-ai/src/__tests__/foundry.live.test.ts` is the canonical verification harness for proxy-sensitive behavior.

- The default per-provider models are the hard gate:
  - OpenAI: `gpt-5-nano`
  - Anthropic: `claude-haiku-4.5`
  - Google: `gemini-3.1-flash-lite`
- The rest of the catalog is survey coverage. Those rows remain visible in the matrix and docs, but non-pass results do not fail the suite by default.
- Survey coverage runs the current public catalog only.
- `--model <model>` widens the live suite to catalog scope unless the caller explicitly pins `--canonical` or `--catalog`, so targeted non-default model runs do not silently collapse to zero cases.
- The suite records local artifacts under `.memory/capability-runs/<run-id>/`:
  - `results.json`
  - `summary.md`
  - `otel-spans.json`
- `pnpm test:live` should show incremental progress while the matrix runs.
- Survey rows may run concurrently, but the canonical must-pass rows should stay straightforward and stable.
- Generated docs must present the matrix in a model-first view:
  - one table per provider
  - models as rows
  - capabilities as columns
  - newest models at the top of each provider table
- Full unfiltered live runs may refresh the committed matrix docs. Targeted/debug runs should not rewrite committed docs unless explicitly requested.

Primary live language-model capabilities currently covered:

- `text.generate`
- `messages.generate`
- `rid.passthrough`
- `text.stream`
- `structured.output.object`
- `tool.loop.deterministic`
- `agent.tool_loop`
- `structured.plus.tools`
- `vision.image_input`
- `reasoning.visibility`
- `registry.routing`
- `embedding.proxy_probe` for both catalogued OpenAI embedding models; Anthropic and Google remain explicitly unsupported

Explicitly unsupported or out-of-scope capabilities should stay visible in the matrix as `skipped` until the package or the active Foundry stack actually supports them.

## Verification Reporting

- The committed verification docs should eventually use provider-specific support tables in the style of the AI SDK provider pages: one table per provider, models as rows, capabilities as columns.
- Newer models should appear at the top of each provider table.
- The harness results artifact remains the source record, but the published docs should present that artifact in a model-first view for faster review.

## Investigation Notes

Use [packages/foundry-ai/docs/harness-capability-results.md](../packages/foundry-ai/docs/harness-capability-results.md) and the matching `.memory/capability-runs/<run-id>/` artifact as the source of truth for current investigation status.

The stable takeaways worth keeping in the spec are:

- Anthropic still shows the most stack-sensitive behavior on reasoning and multi-step/tool-heavy rows.
- OpenAI reasoning visibility is asserted only where the adapter can represent that behavior reliably.
- Survey coverage is intentionally broader than the must-pass default-model gate, so non-pass rows in the matrix do not automatically imply a package regression.
