# @shpitdev/foundry-ai

Use Vercel AI SDK language models, GPT-6 Luna decisions, OpenAI embeddings, and realtime audio through Palantir Foundry's proxy endpoints.

Formerly `@nyrra/foundry-ai`: versions up to 0.0.9 stay there, deprecated. To move, replace the package name in your dependencies and imports; the API is unchanged.

## Install

Install only the provider peers you use:

```sh
pnpm add @shpitdev/foundry-ai ai@7 @ai-sdk/openai@4
```

Use `@ai-sdk/anthropic` for Claude and `@ai-sdk/google` for Gemini. Use `@ai-sdk/xai@4` for Grok. Use stable AI SDK 7 with provider v4 for new integrations. AI SDK 6/provider v3 and the late SDK 7 beta line from `7.0.0-beta.187` remain compatible, but the current live survey uses stable SDK 7.

## Configure and call a model

Set `FOUNDRY_URL` and `FOUNDRY_TOKEN` in your server environment. Optional variables are `FOUNDRY_ATTRIBUTION_RID`, `FOUNDRY_TRACE_PARENT`, and `FOUNDRY_TRACE_STATE`. Keep server tokens out of browser code.

```ts
import { loadFoundryConfig } from '@shpitdev/foundry-ai';
import { createFoundryOpenAI } from '@shpitdev/foundry-ai/openai';
import { generateText } from 'ai';

const openai = createFoundryOpenAI(loadFoundryConfig());
const { text } = await generateText({
  model: openai('gpt-5-mini'),
  prompt: 'Reply in one sentence.',
});
console.log(text);
```

For explicit configuration, pass `{ foundryUrl, token }` to the factory. Other factories are `createFoundryAnthropic`, `createFoundryGoogle`, and `createFoundryXai`, imported from the `anthropic`, `google`, and `xai` subpaths.

[Models and test status](./docs/README.md) covers model IDs, routing, known failures, and dated live results. Catalog membership alone does not establish feature support. CI verifies SDK compatibility offline; live Foundry probes are manual.

## xAI / Grok

Install `@ai-sdk/xai@4` with AI SDK 7 (or `@ai-sdk/xai@3` with SDK 6). The xAI subpath does not require the OpenAI peer.

```ts
import { createFoundryXai } from '@shpitdev/foundry-ai/xai';

const xai = createFoundryXai(loadFoundryConfig());
const model = xai('grok-4-6'); // Defaults to the xAI Responses route.
// Explicit routes: xai.responses('grok-4-6') or xai.chat('grok-4-6').
```

Grok uses model identity `foundry-xai`, catalog provider `xai`, registry prefix `xai:`, and `providerOptions.xai`. Both endpoints are beta. See [xAI setup and migration](./docs/xai.md) and the [current Grok results](./docs/README.md#xai) for verified capabilities and remaining gaps.

## Embeddings and multiple providers

```ts
import { embed } from 'ai';

const { embedding } = await embed({
  model: openai.embeddingModel('text-embedding-3-small'),
  value: 'Text to embed',
});
```

Compose multiple providers with AI SDK `createProviderRegistry`; this package exports no registry wrapper. See the [runnable examples](https://github.com/shpitdev/foundry-ai/blob/main/examples/README.md) for registry and tool workflows.

Server environment configuration is the validated runtime path. Palantir TSv1/TSv2 functions and `PlatformClient` fetch integration have not been verified end to end.

## Decisions (GPT-6 Luna)

`openai.decisionModel('gpt-6-luna')` routes AI SDK's `experimental_decide` through Foundry's OpenAI `/decisions` proxy. Verified with `ai` 7.0.176 and `@ai-sdk/openai` 4.0.121; earlier SDK 7 releases had incompatible experimental decision contracts, and an `@ai-sdk/openai` without `decisionModel` throws.

```ts
import { experimental_decide as decide } from 'ai';

const { answers } = await decide({
  model: openai.decisionModel('gpt-6-luna'),
  state: 'My order arrived with a cracked screen.',
  questions: {
    damaged: { type: 'boolean', instructions: 'Is a damaged item reported?' },
    route: {
      type: 'choice',
      instructions: 'Which team?',
      criteria: { billing: null, shipping: null },
    },
  },
});
```

Boolean, choice, and score questions are supported. Do not set `providerOptions.openai.promptCacheKey`; Foundry rejects it with HTTP 400. See [decision results](./docs/README.md#decisions).

## Realtime (AI SDK 7 only)

Use `createFoundryRealtime` and `createFoundryRealtimeSetup` from `@shpitdev/foundry-ai/realtime` with `gpt-realtime`, `gpt-realtime-1.5`, `gpt-realtime-2.1`, or `gpt-realtime-2.1-mini`. Install `ai@7` and `@ai-sdk/openai@4`; this subpath uses the SDK's experimental realtime interface and does not support SDK 6.

Foundry authenticates WebSockets with the current user's access token. It does not use OpenAI's client-secret endpoint. See [realtime setup and live results](./docs/README.md#realtime) for the browser flow and the manual test command.

## Examples

[Runnable examples](https://github.com/shpitdev/foundry-ai/tree/main/examples) cover text, streaming, tool calls, and more.

Copyright 2026 SHPIT LLC. [Apache-2.0](./LICENSE).
