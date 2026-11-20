# @shpitdev/foundry-effect-ai

[Effect AI](https://effect.website) providers for Palantir Foundry's LLM proxy: OpenAI, Anthropic, Google and xAI language models, GPT-6 Luna decisions and OpenAI embeddings, addressed by catalog alias or model RID. The package speaks each vendor's wire protocol itself; `effect` is its only peer dependency.

## Install

```sh
pnpm add @shpitdev/foundry-effect-ai effect
```

Requires `effect` 4.1.4 or later.

## Modules

Import each module by its subpath. There is no root entry, so a program that uses one vendor bundles only that vendor's code.

| Module                    | Route                                                                     | Effect AI service |
| ------------------------- | ------------------------------------------------------------------------- | ----------------- |
| `FoundryClient`           | Proxy transport: URL, token, attribution and trace headers, error mapping | `FoundryClient`   |
| `OpenAiLanguageModel`     | `/openai/v1/responses`                                                    | `LanguageModel`   |
| `OpenAiChatLanguageModel` | `/openai/v1/chat/completions`                                             | `LanguageModel`   |
| `AnthropicLanguageModel`  | `/anthropic/v1/messages`                                                  | `LanguageModel`   |
| `GoogleLanguageModel`     | `/google/v1/models/{rid}:generateContent`                                 | `LanguageModel`   |
| `XaiLanguageModel`        | `/xai/v1/responses`                                                       | `LanguageModel`   |
| `OpenAiDecisionModel`     | `/openai/v1/decisions`                                                    | `DecisionModel`   |
| `OpenAiEmbeddingModel`    | `/openai/v1/embeddings`                                                   | `EmbeddingModel`  |

Each model module exports `model(id, config?)`, `make` and `layer`, like Effect's own providers. Known aliases resolve to RIDs; any other string is sent unchanged, so enrollment-specific RIDs work.

## Configure

`FoundryClient.layerConfig()` reads `FOUNDRY_URL` and `FOUNDRY_TOKEN`, plus the optional `FOUNDRY_ATTRIBUTION_RID`, `FOUNDRY_TRACE_PARENT` and `FOUNDRY_TRACE_STATE`. It needs an `HttpClient`; use `FetchHttpClient` or your platform's client.

```ts
import * as FoundryClient from '@shpitdev/foundry-effect-ai/FoundryClient';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';

const Foundry = FoundryClient.layerConfig().pipe(Layer.provide(FetchHttpClient.layer));
```

For explicit settings, use `FoundryClient.layer({ foundryUrl, token: Redacted.make(token) })`. `transformClient` wraps the HTTP client after authentication. Non-2xx responses are already failures at that point, so `HttpClient.retryTransient({ times: 2 })` or `HttpClient.retry(schedule)` applies to 429 and 5xx responses. Keep server tokens out of browser code.

## Examples

The examples below use `Foundry` from the previous section.

### Text and streaming

```ts
import * as OpenAiLanguageModel from '@shpitdev/foundry-effect-ai/OpenAiLanguageModel';
import * as LanguageModel from 'effect/ai/LanguageModel';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Stream from 'effect/Stream';

const program = Effect.gen(function* () {
  const response = yield* LanguageModel.generateText({ prompt: 'Say hello.' });
  console.log(response.text);
  yield* LanguageModel.streamText({ prompt: 'Write a haiku about Foundry.' }).pipe(
    Stream.runForEach((part) =>
      part.type === 'text-delta'
        ? Effect.sync(() => process.stdout.write(part.delta))
        : Effect.void,
    ),
  );
});

await program.pipe(
  Effect.provide(Layer.provide(OpenAiLanguageModel.model('gpt-6-luna'), Foundry)),
  Effect.runPromise,
);
```

`AnthropicLanguageModel`, `GoogleLanguageModel`, `XaiLanguageModel` and `OpenAiChatLanguageModel` work the same way. Request-wide settings go in `config`, under the vendor's wire names: `OpenAiLanguageModel.model('gpt-6-luna', { reasoning: { effort: 'medium', summary: 'auto' } })`, `AnthropicLanguageModel.model('claude-opus-5.5', { thinking: { type: 'adaptive' } })`, or `GoogleLanguageModel.model('gemini-3.1-pro', { thinkingConfig: { includeThoughts: true, thinkingLevel: 'HIGH' } })`.

### Tools

`generateText` runs the tool handlers; send the results back for the answer. Reasoning, signatures and item IDs travel in the response parts, so the replay works without server-side state.

```ts
import * as Prompt from 'effect/ai/Prompt';
import * as Tool from 'effect/ai/Tool';
import * as Toolkit from 'effect/ai/Toolkit';
import * as Schema from 'effect/Schema';

const GetWeather = Tool.make('GetWeather', {
  description: 'Get the current weather in a city',
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.Struct({ temperatureC: Schema.Finite }),
});
const toolkit = Toolkit.make(GetWeather);
const handlers = toolkit.toLayer({ GetWeather: () => Effect.succeed({ temperatureC: 21 }) });

const answer = Effect.gen(function* () {
  const prompt = Prompt.make('What is the weather in Paris?');
  const first = yield* LanguageModel.generateText({ prompt, toolkit });
  const second = yield* LanguageModel.generateText({
    prompt: Prompt.concat(prompt, Prompt.fromResponseParts(first.content)),
    toolkit,
  });
  return second.text;
}).pipe(
  Effect.provide(
    Layer.mergeAll(Layer.provide(OpenAiLanguageModel.model('gpt-6-luna'), Foundry), handlers),
  ),
);
```

### Structured output

```ts
import * as AnthropicLanguageModel from '@shpitdev/foundry-effect-ai/AnthropicLanguageModel';

const Capital = Schema.Struct({ city: Schema.String, country: Schema.String });

const capital = LanguageModel.generateObject({
  prompt: 'Name the capital of France and its country.',
  schema: Capital,
}).pipe(
  Effect.map((response) => response.value),
  Effect.provide(Layer.provide(AnthropicLanguageModel.model('claude-sonnet-5.5'), Foundry)),
);
```

### Decisions

GPT-6 Luna answers probability, classification and rating questions in one call.

```ts
import * as OpenAiDecisionModel from '@shpitdev/foundry-effect-ai/OpenAiDecisionModel';
import * as Decision from 'effect/ai/Decision';
import * as DecisionModel from 'effect/ai/DecisionModel';

const triage = Decision.make({
  input: Schema.String,
  decisions: {
    damaged: Decision.probability({ instructions: 'Does the customer report damage?' }),
    team: Decision.classify({
      instructions: 'Which team should handle this ticket?',
      criteria: { billing: 'Payments and refunds.', shipping: 'Delivery and damaged items.' },
    }),
  },
});

const result = DecisionModel.decide(triage, {
  input: 'My order arrived with a cracked screen.',
}).pipe(
  Effect.map(({ answers }) => [answers.damaged.probability, answers.team.label]),
  Effect.provide(Layer.provide(OpenAiDecisionModel.model('gpt-6-luna'), Foundry)),
);
```

### Embeddings

```ts
import * as OpenAiEmbeddingModel from '@shpitdev/foundry-effect-ai/OpenAiEmbeddingModel';
import * as EmbeddingModel from 'effect/ai/EmbeddingModel';

const vectors = EmbeddingModel.EmbeddingModel.use((model) =>
  model.embedMany(['cracked screen', 'late delivery']),
).pipe(
  Effect.provide(
    Layer.provide(
      OpenAiEmbeddingModel.model('text-embedding-3-small', { dimensions: 256 }),
      Foundry,
    ),
  ),
);
```

`text-embedding-3-*` can shorten vectors with `dimensions`; `text-embedding-ada-002` cannot.

## Provider metadata

Response parts, prompt options and errors carry this package's data under its own keys: `foundry-openai`, `foundry-anthropic`, `foundry-google` and `foundry-xai`, plus `foundry` for transport errors (`errorName`, `errorInstanceId`, `code`, `type`). These keys are typed. If your project checks library declarations (`skipLibCheck: false`), enable `exactOptionalPropertyTypes`, as Effect recommends.

## More

- [Models and live test status](./docs/README.md): capabilities per model, Foundry quirks the adapters handle, and what is out of scope.
- [Design record](./docs/PLAN.md) and [wire protocol notes](./docs/protocols/README.md).
- [`@shpitdev/foundry-ai`](../foundry-ai/README.md), the Vercel AI SDK version of these adapters.
