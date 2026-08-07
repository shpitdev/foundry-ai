---
name: foundry-ai-provider
description: Use when wiring @nyrra/foundry-ai into an app that should call Palantir Foundry LLM proxy endpoints through AI SDK 6 or 7. Covers env setup, matching provider peer generations, current model aliases, alias vs RID routing, provider compatibility rules, and when to avoid unverified Foundry-native runtimes.
---

# Foundry AI Provider

## Use this skill when

- adding `@nyrra/foundry-ai` to an app
- replacing direct public provider calls with Foundry proxy endpoints
- troubleshooting alias vs RID behavior or provider-specific Foundry caveats
- adding OpenAI embeddings through Foundry's OpenAI-compatible proxy

## Quick start

1. Install `@nyrra/foundry-ai`, `ai`, and only the provider peer dependency you need. Match AI SDK 6 with provider v3 or AI SDK 7 with provider v4.
2. Load config from `FOUNDRY_URL` and `FOUNDRY_TOKEN`, with optional `FOUNDRY_ATTRIBUTION_RID`, `FOUNDRY_TRACE_PARENT`, and `FOUNDRY_TRACE_STATE`.
3. Import only the provider subpath you need: `openai`, `anthropic`, or `google`.
4. Use a known alias when the model is in the package catalog. Use a raw Foundry RID when it is not.
5. Compose multi-provider routing in application code with AI SDK `createProviderRegistry`.

## Constraints

- Treat this as server-side infrastructure. Do not expose Foundry tokens in browser code.
- The verified package path today is env-based server usage.
- Do not claim support for Palantir TSv1/TSv2 standalone functions or `PlatformClient` fetch wiring without validating that runtime first.
- Do not add compatibility shims for removed package exports such as a registry helper.

## Read these references when needed

- `references/examples/provider-registry.ts`: minimal multi-provider registry composition
- `references/examples/tool-calling.ts`: tight blocking tool-call example
- `references/examples/tool-calling-streaming.ts`: tight streaming tool-call example
- `references/runtime-setup.md`: env-based setup and Foundry-native runtime caveats
- `references/provider-behavior.md`: supported peer ranges, current aliases, alias vs RID behavior, and provider-specific constraints

The `references/examples/*.ts` files are the source of truth. The repo-root `examples/` entries are thin wrappers so the published skill and local runnable examples stay in sync.

## Common mistakes

- installing all provider peers instead of only the ones the app imports
- mixing AI SDK 6/provider v3 packages with AI SDK 7/provider v4 packages
- setting `providerOptions.openai.store = true`
- enabling Anthropic `toolStreaming` or tool-level `eagerInputStreaming`, which the Foundry proxy rejects
- assuming Google support is as stable as OpenAI or Anthropic
- expecting embedding methods from Anthropic or Google, or image methods from any provider
- claiming Foundry-native runtime support because the proxy family exists in Palantir docs
