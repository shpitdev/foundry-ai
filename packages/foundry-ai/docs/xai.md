# xAI / Grok

Use `createFoundryXai` from `@nyrra/foundry-ai/xai`. It uses the native `@ai-sdk/xai` peer and requires no OpenAI SDK or direct xAI credentials. Foundry supplies upstream credentials.

```sh
pnpm add @nyrra/foundry-ai ai@7 @ai-sdk/xai@4
# AI SDK 6: use ai@6 with @ai-sdk/xai@3.
```

The tested native versions are `4.0.59` for SDK 7 and `3.0.132` for SDK 6; the supported late beta matrix uses `4.0.0-beta.76`. Native 5.0.0 removes Chat Completions and is outside this package's peer range.

```ts
import { loadFoundryConfig } from '@nyrra/foundry-ai';
import { createFoundryXai } from '@nyrra/foundry-ai/xai';
import { createProviderRegistry, generateText } from 'ai';

const xai = createFoundryXai(loadFoundryConfig());
const registry = createProviderRegistry({ xai });
const { text } = await generateText({
  model: registry.languageModel('xai:grok-4-6'),
  prompt: 'Reply in one sentence.',
});
```

## Routes and identity

| Method | Foundry route |
|---|---|
| `xai(id)`, `xai.languageModel(id)`, `xai.responses(id)` | `/api/v2/llm/proxy/xai/v1/responses` |
| `xai.chat(id)` | `/api/v2/llm/proxy/xai/v1/chat/completions` |

[Palantir documents both endpoints as beta](https://www.palantir.com/docs/foundry/aip/llm-provider-compatible-apis). Endpoint availability does not prove that a particular model or feature is supported. There is no automatic route fallback. Responses is the default and the route verified for generation on all seven Grok models.

Model instances expose `provider: 'foundry-xai'`. Catalog metadata exposes `provider: 'xai'`. The root exports `XAI_MODELS`, `XAI_MODEL_IDS`, `KnownXaiModelId`, and `XaiModelId`. The `xai` subpath exports `createFoundryXai` and `FoundryXaiProvider`; root imports stay free of provider SDK dependencies.

All seven Grok entries retain their aliases, RIDs, and enrollment metadata. Both methods resolve catalog aliases to RIDs, accept exact RIDs, and pass unknown enrollment-specific IDs unchanged. Known models from other providers are rejected. Embedding and image models are not exposed.

Use `providerOptions.xai` and native `xai` provider metadata. There is no OpenAI option alias. Provider-specific options remain subject to Foundry's beta API support; the adapter exposes only language routes, not native xAI's files, search helpers, image, video, speech, batch, or realtime APIs.

## Governance and history

Both methods reject `providerOptions.xai.store: true` before fetching. Responses forces `store: false`; Chat Completions omits `store`. Bearer authentication, attribution, and trace headers use the common Foundry configuration.

Native xAI already serializes assistant history as plain text. Foundry still rejects its optional assistant message IDs, so the adapter removes those IDs while preserving tool-call and reasoning IDs.

Foundry omits `object: "response"` in Responses payloads and omits `output` in initial SSE response metadata. The native SDK requires these fields. A small fetch adapter supplies the omitted discriminator and an empty initial output array. It preserves explicit values, errors, content, and stream events; it does not synthesize missing reasoning-start events. Chat requests and responses bypass this adaptation.

## Verification

Offline SDK fetch tests cover both URLs, alias/RID routing, custom IDs, identity and registry calls, authentication/trace headers, store handling before generate/stream calls, cancellation, and Responses history/tool normalization. Recorded response/SSE fixtures test native schema adaptation, text/tool parsing, an executed tool round-trip, and the September stream shape that omitted reasoning-start events. They complement the dated live checks below.

Run the affected manual survey with process-only `FOUNDRY_URL` and `FOUNDRY_TOKEN`:

```sh
LIVE_MODELS=xai pnpm run test:live -- language
# One model, including the explicit Chat Completions probe:
LIVE_MODELS=grok-4-6 pnpm run test:live -- language
```

The capability cases use Responses. A separate `Chat Completions rejected` case asserts that the explicit Chat Completions method still returns HTTP 400, so it fails when Foundry starts accepting those requests. This is a manual integration check, not a CI or production-wide guarantee.

### Live verification

**November 19, 2026:** AI SDK 7.0.176 / `@ai-sdk/xai` 4.0.59 passed 55 of 56 Responses probes across the seven models, after isolated reruns of two JSON + tools cases that failed once. Grok 420 non-reasoning produced no reasoning signal. See the [Grok results](./README.md#xai).

Foundry now sends reasoning-start events before reasoning-summary deltas. On September 24, their absence failed streaming text or streamed tools on six aliases. Grok 4.6 also passes on `main` with 4.0.58, so the fix is on the proxy side. The adapter still does not invent these events.

All seven explicit Chat Completions text probes returned HTTP 400 (`Failed to deserialize request body`). This does not prove all possible chat requests are unsupported.
