# Models and live test status

**Catalog as of November 22, 2026 (UTC):** 73 entries — 65 language aliases, three OpenAI embeddings, and five realtime models. The listed Snowflake and Llama embeddings do not serve the OpenAI embeddings route; Schematic 7B does not serve either OpenAI language proxy route. Standalone transcription is not exposed.

Llama 3.3 Nemotron Super 49B appears in Foundry’s listing but does not serve either OpenAI language proxy route.

**November 19, 2026 sweep:** AI SDK 7.0.176 with `@ai-sdk/openai` 4.0.121, `@ai-sdk/anthropic` 4.0.106, `@ai-sdk/google` 4.0.122, and `@ai-sdk/xai` 4.0.59, run serially over the full catalog, plus isolated reruns of unexpected outcomes. Basic text passed on all 52 language aliases in that sweep. All three embeddings passed.

**November 22, 2026 follow-up (UTC):** Tested GPT-6.2 Sol, GPT-6.2 Astra, Gemini 4 Neon, and GPT Realtime 2 on AI SDK 7.0.177, with the same provider versions. A separate survey tested 11 open-weight aliases on AI SDK 7.0.177 with `@ai-sdk/openai-compatible` 3.0.94 for Chat and `@ai-sdk/openai` 4.0.121 for Gemma Responses, with one isolated rerun per failed cell.

[Install and configure](../README.md). Results apply to the tested Foundry account/enrollment, not every stack or production deployment. Each cell is one probe run, or its isolated rerun; a pass shows the request worked then, not that it is reliable. Live checks run manually; CI does not call Foundry. The language-model survey uses an 8,192-token output ceiling, lowered where Foundry lists a smaller limit. Raw reports stay locally under `.memory/`.

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

Uses `createFoundryXai` with native `@ai-sdk/xai` 4.0.59 on Responses. The adapter does not expose Chat Completions because Foundry rejected valid text probes with HTTP 400. See [xAI setup](./xai.md).

| Model                           | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ------------------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `grok-4-6`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-420-reasoning-latest`     | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-420-non-reasoning-latest` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `grok-4-7`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-4-5`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-4-3`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |

### DeepSeek

| Model           | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| --------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `deepseek-v3.2` | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | R     | ✓         |

### NVIDIA Nemotron

| Model                   | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ----------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `nemotron-3-super-120b` | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | R     | ✓         |
| `nemotron-3-nano-30b`   | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | R     | ✓         |
| `nemotron-3-ultra-550b` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | R     | ×         |

### Qwen

| Model                  | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ---------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `qwen3-32b`            | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | R     | ✓         |
| `qwen3-235b-a22b-2507` | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | R     | ×         |

### Moonshot Kimi

| Model                     | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ------------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `kimi-k3.1-pro-highspeed` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `kimi-k3`                 | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `kimi-k2.5`               | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | ✓     | ×         |

### Z.ai GLM

November 22, 2026 (UTC), on Foundry's Chat Completions route. Every failure was rerun in isolation and the result was unchanged.

| Model     | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| --------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `glm-5`   | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | R     | ✓         |
| `glm-5.3` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | R     | ×         |

- GLM-5 skipped the tool both times when asked for JSON and a tool in the same request. GLM-5.3 passed the AI SDK probe; the [Effect probe](../../foundry-effect-ai/docs/README.md#zai-glm) got prose instead of JSON.
- Both image requests returned HTTP 404 `LanguageModelNotAvailable`: the serving backend does not support vision.
- The reasoning probe used high effort. GLM-5 exposed reasoning text; GLM-5.3 only reported reasoning token usage, which does not count as visible reasoning.

### Gemma

| Model             | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ----------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `gemma-4-31b`     | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | ✓     | ×         |
| `gemma-4-26b-a4b` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |

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
- **Open-weight models:** Foundry rejected image input on every DeepSeek, Nemotron, and Qwen alias. Nemotron 3 Ultra streamed tools, Qwen3 32B tools, and Gemma 4 26B JSON + tools passed only on isolated rerun. Standalone JSON used default reasoning; JSON with tools is not consistently supported. The reasoning column uses high effort for DeepSeek, Nemotron, and Qwen, with defaults for Kimi and Gemma. Qwen3 235B reasoning passed once, then timed out in the follow-up and its isolated rerun.
- **Not proven:** missing reasoning events or token usage do not show that a model cannot reason.

## Model routing

| Models                 | Factory / subpath                      | Required peer               |
| ---------------------- | -------------------------------------- | --------------------------- |
| GPT / OpenAI reasoning | `createFoundryOpenAI` / `openai`       | `@ai-sdk/openai`            |
| Claude                 | `createFoundryAnthropic` / `anthropic` | `@ai-sdk/anthropic`         |
| Gemini                 | `createFoundryGoogle` / `google`       | `@ai-sdk/google`            |
| Grok                   | `createFoundryXai` / `xai`             | `@ai-sdk/xai`               |
| DeepSeek               | `createFoundryDeepSeek` / `deepseek`   | `@ai-sdk/openai-compatible` |
| NVIDIA Nemotron        | `createFoundryNvidia` / `nvidia`       | `@ai-sdk/openai-compatible` |
| Qwen                   | `createFoundryQwen` / `qwen`           | `@ai-sdk/openai-compatible` |
| Moonshot Kimi          | `createFoundryMoonshot` / `moonshot`   | `@ai-sdk/openai-compatible` |
| Z.ai GLM               | `createFoundryZai` / `zai`             | `@ai-sdk/openai-compatible` |
| Gemma                  | `createFoundryGemma` / `gemma`         | `@ai-sdk/openai`            |

DeepSeek, NVIDIA Nemotron, Qwen, Moonshot Kimi, and Z.ai GLM use `/api/v2/llm/proxy/openai/v1/chat/completions`. Gemma uses `/api/v2/llm/proxy/openai/v1/responses`. These factories accept only their maker's catalog aliases or raw language-model RIDs; a known RID from another maker is rejected. OpenAI, Anthropic, Google, and xAI forward unknown model strings unchanged. Grok uses the xAI Responses route. Foundry supplies upstream credentials; there is no endpoint fallback.

Use `MODEL_CATALOG` and `getModelMetadata(id)` from the installed package for IDs and metadata. Metadata such as `supportsVision` is not a live guarantee.

OpenAI rejects `providerOptions.openai.store: true`; xAI rejects `providerOptions.xai.store: true`. Responses sends `store: false`. Anthropic disables eager tool streaming and uses JSON-tool structured output, except for Claude Opus 5.5 and Sonnet 5.5, which reject forced tool use and therefore keep the provider's native structured output; Google rewrites API-key authentication into Foundry bearer authentication.

For reasoning on DeepSeek, Nemotron, or Qwen, set `reasoningEffort: 'high'` under `providerOptions.deepseek`, `providerOptions.nvidia`, or `providerOptions.qwen`. Tagged thinking is returned separately from the answer. Moonshot Kimi can return separate reasoning by default; set `providerOptions.moonshot.reasoningEffort` to `'none'` to turn it off on models that support the switch. Foundry rejects replayed Kimi reasoning, so the adapter removes it from outgoing assistant messages. Chat requests never send `parallel_tool_calls`. Gemma does not send OpenAI-specific or generic reasoning options.

For Z.ai, set `providerOptions.zai.reasoningEffort` to `'high'` to see GLM-5's reasoning. Both GLMs accept `'low'`, `'medium'`, and `'high'`; `'none'` works only on GLM-5, and `'xhigh'` and `'max'` only on GLM-5.3. The adapter omits unsupported values so Foundry uses the model's default. GLM-5.3 needs enough `maxOutputTokens` for both reasoning and the visible answer; the live probes use 8,192.

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

Set `inputAudioTranscription: { model: 'whisper-1' }` in the realtime session config to receive the user's speech as `input-transcription-completed` events.

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
