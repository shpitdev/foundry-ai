# xAI / Grok

Use `createFoundryXai` from `@nyrra/foundry-ai/xai`. It uses the native `@ai-sdk/xai` peer and requires no OpenAI SDK or direct xAI credentials. Foundry supplies upstream credentials.

```sh
pnpm add @nyrra/foundry-ai ai@7 @ai-sdk/xai@4
# AI SDK 6: use ai@6 with @ai-sdk/xai@3.
```

The tested native versions are `4.0.58` for SDK 7 and `3.0.132` for SDK 6; the supported late beta matrix uses `4.0.0-beta.76`. Native 5.0.0 removes Chat Completions and is outside this package's peer range.

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

[Palantir documents both endpoints as beta](https://www.palantir.com/docs/foundry/aip/llm-provider-compatible-apis). Endpoint availability does not prove that a particular model or feature is supported. There is no automatic route fallback. Responses is the default and the route verified for generation on all six Grok models.

Model instances expose `provider: 'foundry-xai'`. Catalog metadata exposes `provider: 'xai'`. The root exports `XAI_MODELS`, `XAI_MODEL_IDS`, `KnownXaiModelId`, and `XaiModelId`. The `xai` subpath exports `createFoundryXai` and `FoundryXaiProvider`; root imports stay free of provider SDK dependencies.

All six existing Grok entries retain their aliases, RIDs, and enrollment metadata. Both methods resolve catalog aliases to RIDs, accept exact RIDs, and pass unknown enrollment-specific IDs unchanged. Known models from other providers are rejected. Embedding and image models are not exposed.

Use `providerOptions.xai` and native `xai` provider metadata. There is no OpenAI option alias. Provider-specific options remain subject to Foundry's beta API support; the adapter exposes only language routes, not native xAI's files, search helpers, image, video, speech, batch, or realtime APIs.

## Governance and history

Both methods reject `providerOptions.xai.store: true` before fetching. Responses forces `store: false`; Chat Completions omits `store`. Bearer authentication, attribution, and trace headers use the common Foundry configuration.

Native xAI already serializes assistant history as plain text. Foundry still rejects its optional assistant message IDs, so the adapter removes those IDs while preserving tool-call and reasoning IDs.

Foundry omits `object: "response"` in Responses payloads and omits `output` in initial SSE response metadata. The native SDK requires these fields. A small fetch adapter supplies the omitted discriminator and an empty initial output array. It preserves explicit values, errors, content, and stream events; it does not synthesize missing reasoning-start events. Chat requests and responses bypass this adaptation.

## Migrate from third-party

- Replace the `third-party` factory import with `createFoundryXai` from the `xai` subpath for Grok calls.
- Register `{ xai: createFoundryXai(config) }` and change `third-party:grok-*` registry selections to `xai:grok-*`.
- Read Grok catalog entries from `XAI_MODELS` / `XAI_MODEL_IDS`; use `KnownXaiModelId` / `XaiModelId` for types.
- Update provider filters and telemetry consumers to `xai` / `foundry-xai`. Model aliases and RIDs do not change. Install `@ai-sdk/xai` and use `providerOptions.xai` for supported options.

Third-party no longer contains Grok catalog entries or xAI routing, and rejects Grok aliases and exact RIDs. No compatibility alias is retained.

## Verification

Offline SDK fetch tests cover both URLs, alias/RID routing, custom IDs, identity and registry calls, authentication/trace headers, store handling before generate/stream calls, cancellation, and Responses history/tool normalization. Recorded response/SSE fixtures test native schema adaptation, text/tool parsing, an executed tool round-trip, and the remaining missing reasoning-start failure. They complement the dated live checks below.

Run the affected manual survey with process-only `FOUNDRY_URL` and `FOUNDRY_TOKEN`:

```sh
pnpm run test:live -- --catalog --provider xai
# One model, including the explicit Chat Completions text probe:
pnpm run test:live -- --model xai:grok-4-6
```

The standard capability cases use Responses. `chat.text.generate` separately probes the explicit Chat Completions method. Raw reports stay in `.memory/capability-runs/`; inspect individual statuses because beta-provider survey failures do not necessarily fail the test process. This is a manual integration check, not a CI or production-wide guarantee.

### Live verification

**September 15, 2026:** AI SDK 7.0.97 / `@ai-sdk/xai` 4.0.58 with the compatibility adapter above recorded **44 passes, 16 failed probes, 6 chat proxy rejections, and 30 skipped modalities**. See the [current six-model table](./README.md#xai).

All six models passed text, conversation history, raw-RID routing, JSON, blocking tools, JSON with executed tools, and image input. Grok 420 non-reasoning also passed streaming text and an executed streaming tool loop. Successful JSON output does not prove strict server-side schema enforcement; image checks cover acceptance and a description.

Remaining gaps:

- Fourteen cases fail when Foundry sends reasoning-summary deltas without start events: native 4.0.58 emits a reasoning delta before opening its SDK reasoning part. This is an interaction between the proxy shape and that parser. The adapter does not invent reasoning-start events.
- One streaming-tool case for `grok-420-reasoning-latest` returned empty final text. The non-reasoning model's reasoning probe found no reasoning evidence. These are separate outcomes.
- All six native chat requests returned HTTP 400 deserialization errors. This does not prove all possible chat requests are unsupported.
