# @shpitdev/foundry-effect-ai

[Effect AI](https://effect.website) providers for Palantir Foundry's LLM proxy: OpenAI, Anthropic, Google and xAI language models, open-weight DeepSeek, NVIDIA Nemotron, Qwen, Moonshot Kimi, Z.ai GLM and Gemma models, GPT-6 Luna decisions, OpenAI embeddings and OpenAI realtime sessions, addressed by catalog alias or model RID. The package speaks each vendor's wire protocol itself; `effect` is its only peer dependency.

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
| `DeepSeekLanguageModel`   | `/openai/v1/chat/completions`                                             | `LanguageModel`   |
| `NvidiaLanguageModel`     | `/openai/v1/chat/completions`                                             | `LanguageModel`   |
| `QwenLanguageModel`       | `/openai/v1/chat/completions`                                             | `LanguageModel`   |
| `MoonshotLanguageModel`   | `/openai/v1/chat/completions`                                             | `LanguageModel`   |
| `ZaiLanguageModel`        | `/openai/v1/chat/completions`                                             | `LanguageModel`   |
| `GemmaLanguageModel`      | `/openai/v1/responses`                                                    | `LanguageModel`   |
| `OpenAiDecisionModel`     | `/openai/v1/decisions`                                                    | `DecisionModel`   |
| `OpenAiEmbeddingModel`    | `/openai/v1/embeddings`                                                   | `EmbeddingModel`  |
| `OpenAiRealtime`          | WebSocket `/language-model-service/ws/v1/open-ai/realtime`                | none: a session   |

Each model module exports `model(id, config?)`, `make` and `layer`, like Effect's own providers. Known aliases resolve to RIDs; any other string is sent unchanged, so enrollment-specific RIDs work. Effect AI has no realtime service, so `OpenAiRealtime` opens a session instead; see [Realtime](#realtime).

## Configure

`FoundryClient.layerConfig()` reads `FOUNDRY_URL` and `FOUNDRY_TOKEN`, plus the optional `FOUNDRY_ATTRIBUTION_RID`, `FOUNDRY_TRACE_PARENT` and `FOUNDRY_TRACE_STATE`. It needs an `HttpClient`; use `FetchHttpClient` or your platform's client.

```ts
import * as FoundryClient from '@shpitdev/foundry-effect-ai/FoundryClient';
import * as FetchHttpClient from 'effect/http/FetchHttpClient';
import * as Layer from 'effect/Layer';

const Foundry = FoundryClient.layerConfig().pipe(Layer.provide(FetchHttpClient.layer));
```

For explicit settings, use `FoundryClient.layer({ foundryUrl, token: Redacted.make(token) })`. `transformClient` wraps the HTTP client after authentication. Non-2xx responses are already failures at that point, so `HttpClient.retry(schedule)` sees every failed status, and `HttpClient.retryTransient({ times: 2 })` retries 408, 429, 500, 502, 503 and 504. Keep server tokens out of browser code.

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

`AnthropicLanguageModel`, `GoogleLanguageModel`, `XaiLanguageModel` and `OpenAiChatLanguageModel` work the same way. Request-wide settings go in `config`, under the vendor's wire names: `OpenAiLanguageModel.model('gpt-6-luna', { reasoning: { effort: 'medium', summary: 'auto' } })`, `AnthropicLanguageModel.model('claude-opus-5.5', { thinking: { type: 'adaptive', display: 'summarized' } })`, or `GoogleLanguageModel.model('gemini-3.1-pro', { thinkingConfig: { includeThoughts: true, thinkingLevel: 'HIGH' } })`.

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

### Open-weight models

`DeepSeekLanguageModel`, `NvidiaLanguageModel`, `QwenLanguageModel`, `MoonshotLanguageModel` and `ZaiLanguageModel` use Foundry's Chat Completions route; `GemmaLanguageModel` uses Responses. Text, streaming, structured output and tool loops work as in the examples above.

```ts
import * as MoonshotLanguageModel from '@shpitdev/foundry-effect-ai/MoonshotLanguageModel';
import * as QwenLanguageModel from '@shpitdev/foundry-effect-ai/QwenLanguageModel';

// Kimi reasons by default; its reasoning arrives as reasoning parts.
const kimi = Layer.provide(MoonshotLanguageModel.model('kimi-k3.1-pro-highspeed'), Foundry);
// DeepSeek, Nemotron and Qwen reason only with `reasoning_effort: 'high'`.
const qwen = Layer.provide(
  QwenLanguageModel.model('qwen3-32b', { reasoning_effort: 'high' }),
  Foundry,
);
```

- DeepSeek, Nemotron and Qwen send reasoning as `<reasoning>` spans inside the text; the adapter returns them as reasoning parts and the rest as text. Under `'high'`, DeepSeek V3.2 often leaves its whole answer inside the reasoning, so leave the effort unset when you need the answer or JSON.
- Kimi's reasoning arrives in `reasoning_content`; `reasoning_effort: 'none'` turns it off. Replays never send it back, which Foundry would reject.
- Use `ZaiLanguageModel.model('glm-5', { reasoning_effort: 'high' })` for separate reasoning parts. `glm-5.3` reports reasoning token counts, not reasoning text, and Foundry rejects `'none'` for it, so the adapter omits that setting.
- Foundry rejects image input for DeepSeek, Nemotron, Qwen and GLM. Kimi and Gemma read images.
- Gemma takes no config: no reasoning control changes it.
- JSON output together with tools is unreliable on DeepSeek, Nemotron, Qwen and Gemma: they usually answer without the tool or in prose.

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

### Realtime

`OpenAiRealtime.connect` opens a scoped WebSocket session on `gpt-realtime`, `gpt-realtime-1.5`, `gpt-realtime-2`, `gpt-realtime-2.1` or `gpt-realtime-2.1-mini`. It does not use `FoundryClient`: pass the current user's own Foundry token, never a shared server token in a browser. Provide a `Socket.WebSocketConstructor`; `Socket.layerWebSocketConstructorGlobal` works in browsers, Node 22 and later, Deno and Bun.

```ts
import * as OpenAiRealtime from '@shpitdev/foundry-effect-ai/OpenAiRealtime';
import * as Redacted from 'effect/Redacted';
import * as Socket from 'effect/socket/Socket';

const reply = Effect.gen(function* () {
  const session = yield* OpenAiRealtime.connect({
    model: 'gpt-realtime-2.1',
    foundryUrl: 'https://example.palantirfoundry.com',
    token: Redacted.make(userToken), // the signed-in user's Foundry token
  });
  yield* session.send({
    type: 'session.update',
    session: { type: 'realtime', output_modalities: ['text'] },
  });
  yield* session.send({
    type: 'conversation.item.create',
    item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Say hello.' }] },
  });
  yield* session.send({ type: 'response.create' });
  yield* session.events.pipe(
    OpenAiRealtime.failOnError,
    Stream.takeUntil((event) => event.type === 'response.done'),
    Stream.runForEach((event) =>
      event.type === 'response.output_text.delta'
        ? Effect.sync(() => process.stdout.write(event.delta))
        : Effect.void,
    ),
  );
}).pipe(Effect.scoped, Effect.provide(Socket.layerWebSocketConstructorGlobal));
```

`send` takes OpenAI's realtime client events under their wire names, and `events` streams the decoded server events, starting with `session.created`. Audio goes in as base64 with `input_audio_buffer.append` and comes out in `response.output_audio.delta` events, 24 kHz PCM by default. For tools, put `yield* OpenAiRealtime.tools(toolkit)` in the session's `tools` and pipe `events` through `OpenAiRealtime.handleToolCalls(session, yield* toolkit)`: after each response with function calls, it runs the handlers, sends their results (a tool's `toModelOutput` text when it has one) and asks for the next response. It never runs client-executed tools or tools with `needsApproval`: a response that calls one gets no `response.create`, so send those outputs and `response.create` yourself. `error` events leave the session open, so they arrive as events unless you add `failOnError`.

To transcribe the user's speech, set `audio.input.transcription: { model: 'whisper-1' }` in `session.update`. Read partial text from `conversation.item.input_audio_transcription.delta` and the final text from `conversation.item.input_audio_transcription.completed`. If transcription fails, `conversation.item.input_audio_transcription.failed` reports the error for that audio item instead. These events are separate from the assistant's audio transcript.

## Provider metadata

Response parts, prompt options and errors carry this package's data under its own keys: `foundry-openai`, `foundry-anthropic`, `foundry-google`, `foundry-xai`, `foundry-deepseek`, `foundry-nvidia`, `foundry-qwen`, `foundry-moonshot`, `foundry-zai` and `foundry-gemma`, plus `foundry` for transport errors (`errorName`, `errorInstanceId`, `code`, `type`). With `exactOptionalPropertyTypes`, which Effect recommends, these keys are typed; without it they read as plain JSON.

## More

- [Models and live test status](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-effect-ai/docs/README.md): capabilities per model, Foundry quirks the adapters handle, and what is out of scope.
- [Design record](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-effect-ai/docs/PLAN.md) and [wire protocol notes](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-effect-ai/docs/protocols/README.md).
- [`@shpitdev/foundry-ai`](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/README.md), the Vercel AI SDK version of these adapters.
