# Models and live test status

**Tested September 14, 2026 (UTC), on stable AI SDK 7.0.97:** OpenAI provider 4.0.65, Anthropic 4.0.52, and Google 4.0.67. The survey covers all 57 language-model aliases and both OpenAI embedding models in this catalog. Three realtime models were verified separately below. Basic text passed on 55 language models; two had proxy access/route failures. Both embeddings passed. Other capabilities have failures or skips as shown below.

[Install and configure](../README.md). [Case-level results and rerun history](./capability-results.json). Results apply to the tested Foundry account/enrollment, not every stack or production deployment. Tests run manually; CI does not call Foundry. All language-model probes now use one 8,192-token output ceiling, including tools, image descriptions, and reasoning; model-specific budget exceptions have been removed. Historical cases retain the settings used in their recorded runs.

## Results

✓ passed; × probe failed; T rate-limited after SDK retries; R proxy rejected; A disabled for this account; U no usable adapter route; — not tested. These are probe outcomes, not a list of intrinsic model capabilities. A failure can reflect the fixture, budget, serving backend, or proxy.

JSON means schema-valid output was observed; it does not establish strict server-side schema enforcement. The focused audit below tests that separately. Tools uses non-streaming `ToolLoopAgent`; stream tools uses `streamText`. JSON + tools requires an executed tool result and matching final structured output with automatic tool selection and a three-step limit. The JSON also includes conversation-history and raw-RID routing probes. Image checks acceptance and a nonempty description, not visual accuracy. Reasoning checks stream events or token usage; it does not rate reasoning quality.

### OpenAI

| Model | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
|---|---|---|---|---|---|---|---|---|
| `gpt-5.6-terra` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `gpt-5.6-sol` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `gpt-5.6-luna` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `gpt-5.5` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `gpt-5.4-nano` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × |
| `gpt-5.4-mini` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × |
| `gpt-5.4` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × |
| `gpt-5.3-codex` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gpt-5.2` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × |
| `gpt-5.1-codex-mini` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gpt-5.1-codex` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gpt-5.1` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gpt-5-nano` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × |
| `gpt-5-mini` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × |
| `gpt-5-codex` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gpt-5` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × |
| `gpt-4.1-nano` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gpt-4.1-mini` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gpt-4.1` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `o4-mini` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × |
| `gpt-4o` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `o3` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × |

### Anthropic

| Model | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
|---|---|---|---|---|---|---|---|---|
| `claude-sonnet-5` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `claude-opus-5` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `claude-opus-4.8` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `claude-opus-4.7` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `claude-sonnet-4.6` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `claude-opus-4.6` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `claude-sonnet-4.5` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `claude-opus-4.5` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `claude-haiku-4.5` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `claude-opus-4.1` | A | A | A | A | A | A | A | A |

### Google

| Model | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
|---|---|---|---|---|---|---|---|---|
| `gemini-3.8-flash` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gemini-3.7-flash` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gemini-3.6-flash` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gemini-3.5-flash-lite` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gemini-3.5-flash` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gemini-3.1-pro` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gemini-3.1-flash-lite` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gemini-3-flash` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |

### Third-party

| Model | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
|---|---|---|---|---|---|---|---|---|
| `gemma-4-31b` | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | × |
| `kimi-k2-5` | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | × |
| `kimi-k3` | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | ✓ |
| `llama-3-3-nemotron-super-49b-v1-5` | U | U | U | U | U | U | U | U |
| `nemotron-3-ultra-550b-a55b-nvfp4` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | R | × |
| `gemma-4-26b-a4b` | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | × |
| `qwen3-235b-a22b-2507` | ✓ | ✓ | ✓ | ✓ | ✓ | × | R | × |
| `qwen3-32b` | ✓ | ✓ | ✓ | × | ✓ | × | R | × |
| `glm-5` | ✓ | ✓ | ✓ | ✓ | ✓ | × | R | × |
| `glm-5-3` | ✓ | ✓ | ✓ | ✓ | ✓ | × | R | ✓ |
| `glm-5-3-flash` | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | ✓ |
| `grok-4-3` | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-4-5` | ✓ | × | ✓ | × | × | ✓ | ✓ | × |
| `grok-4-6` | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-420-non-reasoning-latest` | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-420-reasoning-latest` | ✓ | × | ✓ | ✓ | × | × | ✓ | × |
| `grok-build-0-1` | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |

### Realtime

Requires `ai@7` and `@ai-sdk/openai@4`. The SDK realtime interface remains experimental. All three entries are enabled, usable, and Experimental in `foundry-cli models list --json` (September 14, 2026).

| Model | Connect | Text | Tool result round-trip | Audio output | Audio input |
|---|---|---|---|---|---|
| `gpt-realtime` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `gpt-realtime-1.5` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `gpt-realtime-2` | ✓ | ✓ | ✓ | ✓ | ✓ |

Live probes use SDK 7.0.97 / OpenAI 4.0.65 event serialization and parsing over Foundry WebSockets. Audio is generated 24 kHz PCM, then sent to a fresh session which must recognize the spoken phrase without its text history. Realtime 1.5 initially refused the phrase used to generate the fixture; replacing it with a neutral sentence produced valid audio and all checks passed. Browser microphone capture, speaker playback, interruptions, and long-running sessions were not tested. Results and earlier attempts are under `realtimeVerification` in the existing JSON.

See [realtime setup](#realtime-setup) for authentication, examples, and the manual test command.

### Embeddings

| Model | Probe | Dimensions |
|---|---|---:|
| `text-embedding-3-small` | ✓ | 1536 |
| `text-embedding-3-large` | ✓ | 3072 |

## Findings

- **Shared output ceiling:** all 57 standalone JSON cases were rerun at 8192 tokens: 55 passed, with the existing Opus 4.1 access and Nemotron Super route failures. GLM Flash also passed eight other probes at this ceiling; automatic JSON + tools still skipped execution. Anthropic tool/reasoning and Google streaming/tool checks also passed. Three throttled OpenAI/Google probes passed on isolated retries; space repeated requests when testing the same model. Other historical results retain their original budgets.

- **Catalog freshness:** checked against `foundry-cli models list --json` on September 14, 2026. All retained entries are listed as GA or Experimental; Sunset and delisted entries are excluded. The JSON includes the CLI lifecycle snapshot. Embeddings match by model identifier because their proxy names differ from enrollment RIDs.
- **Enrollment versus proxy access:** Claude Opus 4.1 and Llama Nemotron Super are still listed as GA. The live proxy rejected Opus 4.1 as `DisabledForUser`, and Nemotron Super has no usable configured proxy route. Enrollment does not guarantee proxy compatibility.
- **Streaming:** all six Grok models fail SDK stream parsing with missing text/reasoning-start events. Several OpenAI reasoning probes also fail because Foundry emits incomplete `response.reasoning_summary_part.added` events, even where ordinary text streaming passed.
- **Anthropic settings:** set an explicit `maxOutputTokens`; the SDK default exceeds some Foundry backend limits. The harness uses the shared 8,192-token ceiling for Claude as well. Use adaptive thinking for Opus 4.7/4.8 and Claude 5.
- **Structured output and tools:** the automatic combined probe still has failures. A separate tool-first, JSON-second workflow passed on all five audited models below. GLM Flash standalone JSON passed after correcting the fixture and budget.
- **Blocking tool output:** Qwen 3-32B executed its tool but missed the requested response marker. Kimi K3 passed its blocking tool probe on an isolated retry after previously skipping execution; Grok 4.5 skipped execution in its recorded probe.
- **Image and reasoning limits:** Qwen, GLM-5/5.3, and Nemotron Ultra reject image input. Several third-party models expose no reasoning signal in the tested stream; that does not mean they cannot reason. Google reasoning is not probed by this harness.
- **Evidence corrections:** Codex Mini's tool/image probes passed after increasing their token budgets. The JSON probe now checks its declared schema, and reasoning requires events or token usage rather than matching prose. Embedding IDs are excluded from language-model probes. The JSON retains earlier outcomes alongside focused reruns.
- **Focused retries:** reran all 15 previously rate-limited model/capability pairs individually, spacing successive probes for the same model by 65 seconds. Thirteen passed; GPT-5 and GPT-5 Nano reasoning probes reached the proxy but failed on incomplete `response.reasoning_summary_part.added` events. No rate-limited cases remain in the latest results. Earlier failures remain in the JSON history.

## Structured-output audit

The September 14 follow-up found both misleading negatives and overly broad interpretations of passes. See `structuredOutputInvestigation` in the [case-level evidence](./capability-results.json) for requests, responses, and controls. These are individual smoke tests, not reliability estimates.

| Model | Prompted JSON | Strict schema constraint | Forced tool + JSON together | Tool first, then JSON |
|---|---|---|---|---|
| GLM 5.3 Flash | ✓ | ✓ | Fireworks HTTP 400 | ✓ |
| Kimi K3 | ✓ | ✓ | Fireworks HTTP 400 | ✓ |
| Gemma 4-31B | ✓ | ✓ | ✓ | ✓ |
| Qwen 3-32B | ✓ | ✓ | Returned JSON without required tool | ✓ |
| Nemotron Ultra | ✓ | Failed twice | ✓ | ✓ |

**GLM Flash supports structured output through Foundry.** The old failure exhausted 900 output tokens without visible content. Its [model card](https://huggingface.co/zai-org/GLM-5.3-Flash) documents default maximum reasoning effort. The audit used 4096 tokens; the harness now gives every model 8192. A raw `reasoning_effort: "low"` control also passed with no reported reasoning tokens. The old clinical prompt omitted facts requested by its schema; a retry produced invented details that still passed shape validation. The revised probe supplies all values and checks them exactly. Standalone JSON results now use this revised probe across all providers, with the shared 8192-token ceiling.

**Tools and JSON can conflict at the serving layer.** GLM Flash and Kimi K3 returned a Fireworks-attributed error: `tool_choice (required or a specific function) cannot be combined with response_format`. Automatic selection returned schema-shaped answers without running the tool. This is consistent with JSON constraints preventing tool generation; it does not imply the models lack tools. [Fireworks documents](https://docs.fireworks.ai/guides/function-calling) tool selection, while [Google documents](https://ai.google.dev/gemma/docs/core/model_card_4) Gemma's native function calling. Separating the two requests passed on every audited model:

```ts
// model, tools and prompt are your configured model, tool definitions and task.
const first = await generateText({
  model, tools, prompt,
  toolChoice: { type: 'tool', toolName: 'lookup' },
  maxOutputTokens: 4096,
});
const final = await generateText({
  model,
  messages: [
    { role: 'user', content: prompt },
    ...first.response.messages,
    { role: 'user', content: 'Return the tool result as JSON.' },
  ],
  output: Output.object({ schema }),
  maxOutputTokens: 4096,
});
```

**Nemotron's JSON pass does not prove enforcement.** It obeyed the prompt instead of two strict schemas, including an enum-only raw HTTP control. It also reported zero token usage for nonempty output. Foundry identifies an Azure OpenAI backend; Chat Completions returns 404 and `reasoning.effort` settings return 400. The outgoing Responses request contains the correct `text.format`. This isolates the issue beyond SDK serialization, but cannot distinguish Palantir translation from Azure serving. [NVIDIA also documents serving-runtime limitations](https://docs.nvidia.com/dynamo/dev/recipes/nemotron-3-ultra) around constrained output; we have no evidence that Foundry uses that runtime.

**No missing dependency was identified.** Our OpenAI provider already sends strict JSON Schema. The [Fireworks SDK provider](https://raw.githubusercontent.com/vercel/ai/main/packages/fireworks/src/fireworks-provider.ts) uses OpenAI-compatible chat with additional options, not a different structured-output protocol. Both local Fireworks credentials tested returned 401, so direct upstream parity remains unverified. The separate Kimi reasoning-history and malformed-stream gaps below remain genuine proxy-interface observations.

## Kimi K3 protocol check

Moonshot supports [native Responses](https://platform.kimi.ai/docs/api/responses) and [OpenAI/Anthropic-compatible APIs](https://github.com/MoonshotAI/Kimi-K3/blob/main/README.md). Its Chat Completions guidance requires returning `reasoning_content` with assistant history. API format support depends on the serving backend; our Foundry responses identify Fireworks.

| Foundry route | Focused result |
|---|---|
| Chat Completions (current default) | Blocking tool loop passed on retry; JSON + tools still returned a made-up status without executing the tool. |
| OpenAI Responses | Basic text and blocking tool loop worked. JSON + tools still skipped execution; streaming failed on an incomplete reasoning event. An initial raw tool request timed out at 90 seconds. |
| Anthropic Messages | HTTP 404: the Fireworks backend does not support `CLAUDE_CHAT` for this model. |

Preserving reasoning is a separate proxy gap: Foundry rejects Chat Completions assistant `reasoning_content` with HTTP 400. Removing that field allowed the same tool-result continuation to finish. Responses also supplied reasoning without encrypted content, which SDK 7 warned it would omit with `store: false`. This does not explain the earlier first-turn tool omission, where no assistant history existed yet.

Keep Chat Completions as the default. These probes do not show that Responses or Anthropic works better through this enrollment. The alternative-route SDK probes used a 4096-token budget and no retries; they supplement the catalog survey rather than replacing its results. See `kimiProtocolInvestigation` in the case-level JSON for scope and outcomes.

## Model routing

| Models | Factory / subpath | Required peer |
|---|---|---|
| GPT / OpenAI reasoning | `createFoundryOpenAI` / `openai` | `@ai-sdk/openai` |
| Claude | `createFoundryAnthropic` / `anthropic` | `@ai-sdk/anthropic` |
| Gemini | `createFoundryGoogle` / `google` | `@ai-sdk/google` |
| Gemma, Kimi, Nemotron, Qwen, GLM, Grok | `createFoundryThirdParty` / `third-party` | `@ai-sdk/openai` |

OpenAI, Anthropic, and Google forward unknown model strings unchanged, allowing enrollment-specific RIDs. Third-party routing requires a cataloged alias or exact RID because the adapter must select a proxy. Kimi, Qwen, and GLM use Chat Completions; Gemma and Nemotron Ultra use OpenAI Responses; Grok uses xAI Responses. Foundry supplies upstream credentials; no endpoint failover is performed.

Use `MODEL_CATALOG` and `getModelMetadata(id)` from the installed package for IDs and metadata. Metadata such as `supportsVision` is not a live guarantee.

OpenAI and third-party adapters reject `providerOptions.openai.store: true`. Responses sends `store: false`; third-party Chat Completions omits it. Third-party options use the `openai` namespace. Anthropic disables eager tool streaming and uses JSON-tool structured output; Google rewrites API-key authentication into Foundry bearer authentication.

Only OpenAI exposes `embeddingModel()` and `embedding()`. Embedding strings pass through without language-model RID routing. Realtime audio uses the separate SDK 7-only `realtime` subpath. Standalone speech/transcription, image generation, video, and reranking are not exposed.

## Realtime setup

Requires `ai@7` and `@ai-sdk/openai@4`. See [realtime results](#realtime) for tested capabilities and limits.

Foundry uses `wss://<foundry-host>/language-model-service/ws/v1/open-ai/realtime?model=<api-name>` and a `Bearer-<user-token>` subprotocol. Use the current user's Foundry OAuth token with `language-model-service:use-model`; see [Palantir's authentication instructions](https://www.palantir.com/docs/foundry/realtime-audio/build-a-voice-enabled-osdk-application). `createFoundryRealtimeSetup` packages an existing token; it does **not** mint a short-lived or restricted OpenAI client secret. Never return a shared server token to a browser.

In your authenticated, app-local setup endpoint, return:

```ts
import { createFoundryRealtimeSetup } from '@nyrra/foundry-ai/realtime';

// foundryUserToken must belong to the authenticated caller.
return Response.json(createFoundryRealtimeSetup({
  foundryUrl,
  model: 'gpt-realtime-2',
  token: foundryUserToken,
  tools: [], // Or experimental_getRealtimeToolDefinitions({ tools }) from ai.
}), { headers: { 'Cache-Control': 'no-store' } });
```

Pass the matching model to [AI SDK's realtime client](https://ai-sdk.dev/docs/ai-sdk-core/realtime):

```ts
import { createFoundryRealtime } from '@nyrra/foundry-ai/realtime';

const model = createFoundryRealtime({ foundryUrl })('gpt-realtime-2');
// experimental_useRealtime({ model, api: { token: '/api/realtime/setup' } })
```

For server-side use, [the realtime example](https://github.com/shpitdev/foundry-ai/blob/main/examples/advanced/realtime.ts) shows a direct WebSocket connection. Realtime IDs are excluded from the HTTP language-model survey and rejected by `createFoundryOpenAI`; use the realtime factory instead. API names are used on this endpoint, including the dot in `gpt-realtime-1.5`, rather than model RIDs.

```sh
pnpm run example realtime gpt-realtime-2
pnpm run test:realtime
# Optional isolated model rerun:
pnpm run test:realtime -- --testNamePattern 'gpt-realtime-1.5:'
```

These tests are manual and write generated audio and results under `.memory/realtime-runs/`. They are excluded from CI and the HTTP live suite.

## Run manually

With `FOUNDRY_URL` and `FOUNDRY_TOKEN` set, from the repository root:

```sh
pnpm run test:live -- --catalog
pnpm run test:live:summary
```

Use `--provider anthropic` or `--model openai:gpt-5-nano` for a focused run. To rerun a single case, add `--testNamePattern 'openai:gpt-5-nano: deterministic tool loop$'`. Raw reports stay in `.memory/capability-runs/<runId>/` and record the installed SDK versions. Read the case statuses: survey failures need not fail the test process. Update this overview from reviewed results; do not replace it with raw reports.
