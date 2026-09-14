---
name: foundry-ai-provider
description: Use when integrating @nyrra/foundry-ai with AI SDK 6 or 7 for Palantir Foundry proxy calls, model routing, tools, OpenAI embeddings, or SDK 7 realtime.
---

# Foundry AI provider

Read the package's `../../README.md` for installation and config, and `../../docs/README.md` for model routing, dated live evidence, and limitations. Do not equate catalog membership or offline CI with live capability support.

## Integration rules

- Default to stable AI SDK 7 with provider v4. AI SDK 6 requires provider v3. Install only the required peers; third-party routing uses the OpenAI peer.
- Keep `FOUNDRY_TOKEN` server-side. Use `loadFoundryConfig()` or explicit `{ foundryUrl, token }`.
- Import factories from `openai`, `anthropic`, `google`, or `third-party` subpaths. Compose registries with AI SDK `createProviderRegistry`.
- OpenAI, Anthropic, and Google allow unknown model strings through unchanged. Third-party calls require cataloged aliases or RIDs so the adapter can select a route.
- Never enable `providerOptions.openai.store`. Keep Anthropic eager tool streaming disabled.
- Only OpenAI exposes embeddings. Realtime uses the separate `realtime` subpath, requires SDK 7/provider v4, and authenticates with a current Foundry user token. Never return a server service token to a browser. See the package docs for setup; OpenAI client-secret minting is not supported. Image generation and standalone speech/transcription are not exposed.
- Validate Palantir TSv1/TSv2 or `PlatformClient` integrations before claiming those runtimes work.

## Runnable references

- `references/examples/provider-registry.ts`: multi-provider routing
- `references/examples/tool-calling.ts`: blocking tool loop
- `references/examples/tool-calling-streaming.ts`: streaming tool loop

These files are also the repository's base examples; edit them here instead of duplicating them.
