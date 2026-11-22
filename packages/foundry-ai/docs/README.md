# Models and live test status

**Catalog as of November 21, 2026 (UTC):** 62 entries — 54 language aliases, three OpenAI embeddings, and five realtime models. The listed Snowflake and Llama embeddings do not serve the OpenAI embeddings route; Schematic 7B does not serve either OpenAI language proxy route. Transcription is not exposed.

Both Gemma 4 variants and Llama Nemotron Super appear in Foundry’s listing but are excluded because the package does not provide a dedicated adapter for them.

**November 19, 2026 sweep:** AI SDK 7.0.176 with `@ai-sdk/openai` 4.0.121, `@ai-sdk/anthropic` 4.0.106, `@ai-sdk/google` 4.0.122, and `@ai-sdk/xai` 4.0.59, run serially over the full catalog, plus isolated reruns of unexpected outcomes. Basic text passed on all 52 language aliases in that sweep. All three embeddings passed.

**November 22, 2026 follow-up (UTC):** Tested only GPT-6.2 Sol, GPT-6.2 Astra, Gemini 4 Neon, and GPT Realtime 2 on AI SDK 7.0.177, with the same provider versions.

[Install and configure](../README.md). Results apply to the tested Foundry account/enrollment, not every stack or production deployment. Each cell is one probe run, or its isolated rerun; a pass shows the request worked then, not that it is reliable. Live checks run manually; CI does not call Foundry. The language-model survey uses an 8,192-token output ceiling. Raw reports stay locally under `.memory/`.

## Results

✓ passed; × probe failed; T rate-limited after SDK retries; R proxy rejected; A disabled for this account; — not tested. These are probe outcomes, not a list of intrinsic model capabilities. A failure can reflect the fixture, budget, serving backend, or proxy.

JSON means schema-valid output was observed; it does not establish strict server-side schema enforcement. Tools uses non-streaming `ToolLoopAgent`; stream tools uses `streamText`. JSON + tools requires an executed tool result and matching final structured output with automatic tool selection and a three-step limit. Image checks acceptance and a nonempty description, not visual accuracy. Reasoning checks stream events or token usage; it does not rate reasoning quality.

### OpenAI

| Model                | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| -------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `gpt-5-nano`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-6.2-sol`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6.2-astra`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6.1-terra`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6.1-sol`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6-sol`          | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6-luna`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6-astra`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.6-terra`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.6-sol`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.6-luna`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.5`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.4-nano`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-5.4-mini`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-5.4`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-5.3-codex`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-5.2`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-5.1-codex-mini` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-5.1-codex`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-5.1`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-5-mini`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-5-codex`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-5`              | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-4.1-nano`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-4.1-mini`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-4.1`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |

### Anthropic

| Model               | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `claude-haiku-4.5`  | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-sonnet-5.5` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-opus-5.5`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-haiku-5.5`  | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-sonnet-5`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-opus-5`     | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-opus-4.8`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-opus-4.7`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-sonnet-4.6` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-opus-4.6`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-sonnet-4.5` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-opus-4.5`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |

### Google

| Model                   | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ----------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `gemini-3.1-flash-lite` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gemini-4-neon`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gemini-4-hydrogen`     | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gemini-4-carbon`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gemini-4-argon`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gemini-3.8-flash`      | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | ✓     | —         |
| `gemini-3.5-flash-lite` | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | ✓     | —         |
| `gemini-3.5-flash`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gemini-3.1-pro`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gemini-3-flash`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |

### xAI

Uses `createFoundryXai` with native `@ai-sdk/xai` 4.0.59 and the Foundry compatibility adapter. These columns use Responses; explicit Chat Completions text probes for the six current aliases were proxy-rejected (HTTP 400). See [xAI setup](./xai.md).

| Model                           | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ------------------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `grok-4-6`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-420-reasoning-latest`     | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-420-non-reasoning-latest` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `grok-4-7`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-4-5`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-4-3`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |

### Realtime

Requires `ai@7` and `@ai-sdk/openai@4`. The SDK realtime interface remains experimental.

| Model                   | Connect | Text | Tool result round-trip | Audio output | Audio input |
| ----------------------- | ------- | ---- | ---------------------- | ------------ | ----------- |
| `gpt-realtime`          | ✓       | ✓    | ✓                      | ✓            | ✓           |
| `gpt-realtime-1.5`      | ✓       | ✓    | ✓                      | ✓            | ✓           |
| `gpt-realtime-2`        | ✓       | ✓    | ✓                      | ✓            | ✓           |
| `gpt-realtime-2.1`      | ✓       | ✓    | ✓                      | ✓            | ✓           |
| `gpt-realtime-2.1-mini` | ✓       | ✓    | ✓                      | ✓            | ✓           |

Live probes use SDK 7.0.176 (7.0.177 for GPT Realtime 2) and OpenAI 4.0.121 event serialization and parsing over Foundry WebSockets. Audio is generated 24 kHz PCM, then sent to a fresh session which must recognize the spoken phrase without its text history. Browser microphone capture, speaker playback, interruptions, and long-running sessions were not tested.

See [realtime setup](#realtime-setup) for authentication, examples, and the manual test command.

### Embeddings

| Model                    | Probe | Dimensions |
| ------------------------ | ----- | ---------: |
| `text-embedding-ada-002` | ✓     |       1536 |
| `text-embedding-3-small` | ✓     |       1536 |
| `text-embedding-3-large` | ✓     |       3072 |

### Decisions

November 19, 2026 (UTC), on `ai` 7.0.176 and `@ai-sdk/openai` 4.0.121 through `experimental_decide`. GPT-6 Luna serves Foundry's `/decisions` route by RID or the `gpt-6-luna` alias. GPT-6 Sol, GPT-6 Astra, GPT-6.1 Sol, GPT-6.1 Terra, and GPT-5.6 Luna return `LanguageModelNotAvailable` (HTTP 404). Refusals were observed once, on a CBRN prompt, and surface as `Experimental_DecisionRefusalError`; the repeatable suite does not send such prompts. In the November 22 follow-up, direct requests to `/decisions` also returned HTTP 404 for GPT-6.2 Sol and GPT-6.2 Astra.

| Probe                                            | Result         |
| ------------------------------------------------ | -------------- |
| Boolean question by alias and by RID             | ✓              |
| Boolean question defined only by criteria        | ✓              |
| Choice, score, and boolean questions in one call | ✓              |
| JSON object state                                | ✓              |
| Text, JSON, and PNG image state                  | ✓              |
| `providerOptions.openai.safetyIdentifier`        | ✓              |
| 400 questions, the API maximum                   | ✓, about 1.2 s |

- Foundry rejects `prompt_cache_key` and `prompt_cache_options` with HTTP 400, so leave `providerOptions.openai.promptCacheKey` unset. Implicit caching still works: a repeated prefix of about 4,400 tokens was read from cache on the next call. Palantir documents the `X-Palantir-session-id` header for routing affinity; pass it through `experimental_decide({ headers })`.
- Foundry rejects public image URLs (`InvalidImageUrl`). The SDK sends file state as data URLs.
- The SDK allows choice and score questions without `instructions`, but OpenAI requires them and returns HTTP 400. OpenAI also enforces 1–400 questions, 2–10 score levels, and at least two choices.

## Findings

- **Rate limits:** no case returned HTTP 429 in this serial sweep. Earlier sweeps were throttled; rerun 429s in isolation.
- **Flaky cases:** three sweep failures passed on isolated rerun, and the tables use the reruns: GPT-5.1 Codex text (the model refused the prompt), and JSON + tools on Grok 4.7 and Grok 420 non-reasoning.
- **OpenAI reasoning streams:** the SDK rejects `response.reasoning_summary_part.added` events from the proxy with a type-validation error, so these probes fail even where text streaming passes. GPT-5 Nano is intermittent: it passed in the sweep and failed both isolated reruns. GPT-5 Nano and GPT-5.4 Mini, which passed on September 25, fail the same way on `main`, so this refresh did not cause them.
- **xAI streaming:** Foundry now sends the reasoning-start events the native parser needs. Streaming text, streamed tools, and reasoning passed on every Grok alias except Grok 420 non-reasoning, which produced no reasoning signal. Grok 4.6 also passes on `main` with `@ai-sdk/xai` 4.0.58, so the change is on the proxy side, not the SDK bump.
- **JSON + tools:** the two Gemini failures return no output; Gemini 3.5 Flash-Lite passed on September 25 and fails the same way on `main`.
- **Thinking:** use adaptive thinking for Opus 4.7/4.8, Claude 5, and the Claude 5.5 models; the proxy rejects budget-based thinking for Claude 5.5 with HTTP 400.
- **Not proven:** missing reasoning events or token usage do not show that a model cannot reason.

## Model routing

| Models                 | Factory / subpath                      | Required peer       |
| ---------------------- | -------------------------------------- | ------------------- |
| GPT / OpenAI reasoning | `createFoundryOpenAI` / `openai`       | `@ai-sdk/openai`    |
| Claude                 | `createFoundryAnthropic` / `anthropic` | `@ai-sdk/anthropic` |
| Gemini                 | `createFoundryGoogle` / `google`       | `@ai-sdk/google`    |
| Grok                   | `createFoundryXai` / `xai`             | `@ai-sdk/xai`       |

OpenAI, Anthropic, Google, and xAI forward unknown model strings unchanged, allowing enrollment-specific RIDs. Grok defaults to xAI Responses, with an explicit xAI Chat Completions method. Foundry supplies upstream credentials; no endpoint failover is performed.

Use `MODEL_CATALOG` and `getModelMetadata(id)` from the installed package for IDs and metadata. Metadata such as `supportsVision` is not a live guarantee.

OpenAI rejects `providerOptions.openai.store: true`; xAI rejects `providerOptions.xai.store: true`. Responses sends `store: false`; xAI Chat Completions omits it. Anthropic disables eager tool streaming and uses JSON-tool structured output, except for Claude Opus 5.5 and Sonnet 5.5, which reject forced tool use and therefore keep the provider's native structured output; Google rewrites API-key authentication into Foundry bearer authentication.

Only OpenAI exposes `embeddingModel()`, `embedding()`, and `decisionModel()`. Embedding strings pass through without language-model RID routing; decision aliases resolve to RIDs like language models. Realtime audio uses the separate SDK 7-only `realtime` subpath. Standalone speech/transcription, image generation, video, and reranking are not exposed.

## Realtime setup

Requires `ai@7` and `@ai-sdk/openai@4`. See [realtime results](#realtime) for tested capabilities and limits.

Foundry uses `wss://<foundry-host>/language-model-service/ws/v1/open-ai/realtime?model=<api-name>` and a `Bearer-<user-token>` subprotocol. Use the current user's Foundry OAuth token with `language-model-service:use-model`; see [Palantir's authentication instructions](https://www.palantir.com/docs/foundry/realtime-audio/build-a-voice-enabled-osdk-application). `createFoundryRealtimeSetup` packages an existing token; it does **not** mint a short-lived or restricted OpenAI client secret. Never return a shared server token to a browser.

In your authenticated, app-local setup endpoint, return:

```ts
import { createFoundryRealtimeSetup } from '@shpitdev/foundry-ai/realtime';

// foundryUserToken must belong to the authenticated caller.
return Response.json(
  createFoundryRealtimeSetup({
    foundryUrl,
    model: 'gpt-realtime-2.1',
    token: foundryUserToken,
    tools: [], // Or experimental_getRealtimeToolDefinitions({ tools }) from ai.
  }),
  { headers: { 'Cache-Control': 'no-store' } },
);
```

Pass the matching model to [AI SDK's realtime client](https://ai-sdk.dev/docs/ai-sdk-core/realtime):

```ts
import { createFoundryRealtime } from '@shpitdev/foundry-ai/realtime';

const model = createFoundryRealtime({ foundryUrl })('gpt-realtime-2.1');
// experimental_useRealtime({ model, api: { token: '/api/realtime/setup' } })
```

For server-side use, [the realtime example](https://github.com/shpitdev/foundry-ai/blob/main/examples/advanced/realtime.ts) shows a direct WebSocket connection. Realtime IDs are excluded from the HTTP language-model survey and rejected by `createFoundryOpenAI`; use the realtime factory instead. API names are used on this endpoint, including the dot in `gpt-realtime-1.5`, rather than model RIDs.

```sh
pnpm run example realtime gpt-realtime-2.1
pnpm run test:live -- realtime
LIVE_MODELS=gpt-realtime-2 pnpm run test:live -- realtime
# All five realtime models:
LIVE_MODELS=openai pnpm run test:live -- realtime
```

These tests are manual and excluded from CI. The default live run covers `gpt-realtime-2.1`.

## Run manually

From the repository root, after `infisical login`. The script runs under `infisical run`, which supplies `FOUNDRY_URL` and `FOUNDRY_TOKEN` from the project's `dev` environment (`.infisical.json`):

```sh
pnpm run test:live                              # default models
pnpm run test:live -- realtime                  # one file: language, realtime, or decisions
LIVE_MODELS=xai pnpm run test:live              # every catalog model of a provider
LIVE_MODELS=gpt-5-nano,claude-opus-5.5 pnpm run test:live
LIVE_MODELS=all pnpm run test:live              # catalog sweep
pnpm run test:live -- -t 'openai:gpt-6-luna: JSON \+ tools$'
```

The defaults are `gpt-6-luna`, `claude-haiku-4.5`, `gemini-3.1-flash-lite`, `grok-4-6`, `text-embedding-3-small`, `gpt-realtime-2.1`, and decisions on `gpt-6-luna`. `LIVE_MODELS` takes a comma list of `all`, provider names, or catalog model IDs; an unknown token fails the run. Test names are `provider:model: column`, using the column names above, so `-t` selects a capability. Do not anchor `-t` with `^`: the suite name comes first.

Every case is a hard assertion and runs serially. The default run must pass. A catalog sweep exits 1 on the known failures above; compare its failing test names with these tables. The Image case now sends an inline red PNG and requires the reply to name the color, which is stricter than the November 19 check. Each run writes Vitest's JSON report to `.memory/live/<timestamp>.json`. Update this overview from reviewed results; do not replace it with raw reports.
