# Models and live test status

**Catalog as of November 21, 2026 (UTC):** 57 entries — 54 language aliases and three OpenAI embeddings.

**Sweep of November 20, 2026 (UTC):** `effect` 4.1.4, every model then in the package's lists (52 language aliases and three embeddings) through `LIVE_MODELS=all pnpm run test:live:effect`: 600 cases, run serially, followed by isolated reruns of each failure. Anthropic was then swept again, and the Grok 4.20 reasoning cells rerun, with the final settings described below. **539 of 600 cases pass.** Of the 61 failures, 42 are routes or models Foundry refused and 19 are model behavior that failed the same way on rerun; none is an adapter bug. The sweep also found three adapter issues, fixed before these results: xAI error messages were dropped, Grok 4.20 needed `effort` left out, and Anthropic's adaptive thinking needed its `display` option.

**November 22, 2026 follow-up (UTC):** Tested only GPT-6.2 Sol, GPT-6.2 Astra, and Gemini 4 Neon on `effect` 4.1.4.

[Install and use the package](../README.md). Results apply to the tested Foundry enrollment, not to every stack. Each cell is one probe run or its isolated rerun: a pass shows the request worked then, not that it is reliable. Live checks run manually; CI replays recorded fixtures and never calls Foundry.

## Results

✓ passed; × probe failed; R rejected by the proxy or vendor (HTTP 400) for this route; A not available to this account (HTTP 404); — not tested. These are probe outcomes, not a list of model capabilities: a failure can come from the prompt, the model or the serving backend.

Every language model runs the same cells from `test/capabilities.ts`. **Text** and **Stream** ask for one word, `hello`. **JSON** is `generateObject` for the capital of France. **Tools** and **Stream tools** take two requests: a tool call, then the answer from the tool result, replaying the first turn's reasoning. **JSON + tools** is `generateObject` with the same tool over two requests. **Image** sends an inline red PNG and requires the reply to name the color. **Reasoning** streams a short puzzle and requires visible reasoning text. Reasoning is on for Tools, Stream tools and Reasoning: OpenAI and xAI ask for `effort: 'medium'` and `summary: 'auto'`, Anthropic uses `{ type: 'adaptive', display: 'summarized' }` on Opus 4.7 and later and Claude 5 and 5.5, otherwise a 1,024-token budget, and Gemini uses `thinkingLevel: 'HIGH'` with thought summaries. Models the catalog does not mark as reasoning get no reasoning settings and are not tested for it.

### OpenAI Responses

`OpenAiLanguageModel`.

| Model                | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| -------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `gpt-6.2-sol`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-6.2-astra`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-6.1-terra`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6.1-sol`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-6-sol`          | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6-luna`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6-astra`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `gpt-5.6-terra`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.6-sol`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.6-luna`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.5`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.4-nano`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.4-mini`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.4`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.3-codex`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-5.2`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.1-codex-mini` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-5.1-codex`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-5.1`            | ✓    | ✓      | ✓    | ✓     | ×            | ✓            | ✓     | —         |
| `gpt-5-nano`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5-mini`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5-codex`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-5`              | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-4.1-nano`       | ✓    | ✓      | ✓    | ×     | ✓            | ×            | ✓     | —         |
| `gpt-4.1-mini`       | ×    | ×      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-4.1`            | ✓    | ✓      | ✓    | ✓     | ✓            | ×            | ✓     | —         |

- GPT-4.1 mini answers "Hi" to the one-word `hello` prompt. GPT-4.1 nano calls the tool twice where the cell expects one call. GPT-4.1 and GPT-5.1 sometimes answer without calling the tool.
- GPT-6 Astra and GPT-6.1 Sol reason briefly on this puzzle (27 and 14 reasoning tokens in a direct check) and return empty summaries, so the cell sees no reasoning text. GPT-6.2 Sol and GPT-6.2 Astra also returned no visible reasoning text.

### OpenAI Chat Completions

`OpenAiChatLanguageModel`. Foundry returns no reasoning text on this route, so Reasoning checks for reasoning tokens in usage.

| Model                | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| -------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `gpt-6.2-sol`        | ✓    | ✓      | ✓    | R     | R            | R            | ✓     | ✓         |
| `gpt-6.2-astra`      | ✓    | ✓      | ✓    | R     | R            | R            | ✓     | ✓         |
| `gpt-6.1-terra`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6.1-sol`        | ✓    | ✓      | ✓    | R     | R            | R            | ✓     | ✓         |
| `gpt-6-sol`          | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6-luna`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-6-astra`        | ✓    | ✓      | ✓    | R     | R            | R            | ✓     | ✓         |
| `gpt-5.6-terra`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.6-sol`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.6-luna`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.5`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.4-nano`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.4-mini`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.4`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.3-codex`      | R    | R      | R    | R     | R            | R            | R     | —         |
| `gpt-5.2`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5.1-codex-mini` | R    | R      | R    | R     | R            | R            | R     | —         |
| `gpt-5.1-codex`      | R    | R      | R    | R     | R            | R            | R     | —         |
| `gpt-5.1`            | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |
| `gpt-5-nano`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5-mini`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-5-codex`        | R    | R      | R    | R     | R            | R            | R     | —         |
| `gpt-5`              | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gpt-4.1-nano`       | ✓    | ✓      | ✓    | ×     | ✓            | ×            | ✓     | —         |
| `gpt-4.1-mini`       | ×    | ×      | ✓    | ✓     | ✓            | ×            | ✓     | —         |
| `gpt-4.1`            | ×    | ×      | ✓    | ✓     | ✓            | ×            | ✓     | —         |

- The Codex models have no Chat Completions backend ("model backends are not available"); use `OpenAiLanguageModel`.
- GPT-6 Astra and GPT-6.1 Sol reject function tools while reasoning, and reject `reasoning_effort: 'none'`, so they cannot take tools on this route. GPT-6 Luna, GPT-6 Sol and GPT-6.1 Terra accept tools with `reasoning_effort: 'none'`, which the adapter sends for them.
- GPT-6.2 Sol and Astra reject Chat function tools (HTTP 400), including when the request sets `reasoning_effort: 'none'`. Their Responses tool probes pass.
- The GPT-4.1 failures match the Responses route: "Hi" for `hello` (GPT-4.1 too, here), a skipped or doubled tool call, and, for GPT-4.1 mini, the JSON answer in the same turn as the tool call.

### Anthropic

`AnthropicLanguageModel`.

| Model               | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `claude-opus-5.5`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-sonnet-5.5` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `claude-haiku-5.5`  | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-opus-5`     | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-sonnet-5`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-opus-4.8`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-opus-4.7`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ×         |
| `claude-opus-4.6`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-sonnet-4.6` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-opus-4.5`   | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-sonnet-4.5` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `claude-haiku-4.5`  | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |

- Claude Opus 4.7 and Sonnet 5.5 answered the reasoning puzzle without thinking, twice; adaptive thinking lets the model decide. Their tool cells passed.
- Without `display: 'summarized'`, Claude Opus 5 thinks (the block and signature arrive) but sends no thinking text.

### Google

`GoogleLanguageModel`.

| Model                   | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ----------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `gemini-4-neon`         | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gemini-4-argon`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gemini-4-carbon`       | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gemini-4-hydrogen`     | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gemini-3.8-flash`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gemini-3.5-flash`      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gemini-3.5-flash-lite` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gemini-3.1-pro`        | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gemini-3.1-flash-lite` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `gemini-3-flash`        | ×    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |

- Gemini 3 Flash answers "Hi" to the one-word `hello` prompt.

### xAI

`XaiLanguageModel`, over Foundry's xAI Responses route.

| Model                           | Text | Stream | JSON | Tools | Stream tools | JSON + tools | Image | Reasoning |
| ------------------------------- | ---- | ------ | ---- | ----- | ------------ | ------------ | ----- | --------- |
| `grok-4-7`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-4-6`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-4-5`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-4-3`                      | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-420-reasoning-latest`     | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | ✓         |
| `grok-420-non-reasoning-latest` | ✓    | ✓      | ✓    | ✓     | ✓            | ✓            | ✓     | —         |

- Grok 4.20 reasoning rejects `reasoning.effort`; its cells ask only for `summary`. Grok 4.20 non-reasoning gets no reasoning settings.

### Embeddings

`OpenAiEmbeddingModel`. Both cells pass: `embed` on `text-embedding-ada-002` (1,536 dimensions) and on `text-embedding-3-small` and `text-embedding-3-large` shortened to 8, and `embed-many` on `text-embedding-3-large` at 64, where a repeated input lands next to its twin.

### Decisions

`OpenAiDecisionModel` on `gpt-6-luna`, the only catalog model that serves decisions. Direct requests for GPT-6.2 Sol and GPT-6.2 Astra returned HTTP 404 in the November 22 follow-up. All six live cells pass: a probability, a three-way classification, a 20-way classification that returns every label's probability, a rating, JSON state, and image state (a base64 image is accepted and a URL image fails before sending).

### Transport

`FoundryClient`: a bad token returns `AuthenticationError` and an unknown model `InvalidRequestError` with Foundry's `LanguageModelNotAvailable`, from each vendor route.

## Foundry quirks the adapters handle

- **Stateless requests.** Foundry rejects stored responses, so Responses requests send `store: false` and replay the whole prompt. Reasoning travels with it: encrypted reasoning for OpenAI and xAI, thinking signatures for Anthropic, thought signatures for Gemini. Gemini returns HTTP 400 for a replayed function call without its signature.
- **Lenient decoding.** Foundry omits fields the vendor specs require, such as `object`, and adds events. Wire schemas decode only the fields the adapters read and ignore unknown stream events.
- **Responses reasoning.** Foundry's `response.reasoning_summary_part.added` carries only `type`, so reasoning blocks open from the summary deltas.
- **xAI.** Grok is served through the Responses route with OpenAI's events. The adapter uses the `system` role and always asks for encrypted reasoning. Grok models reject `reasoning.effort: 'none'`; Grok 4.20 reasoning rejects `effort` entirely and takes `summary` alone. xAI error bodies put the message in a string `error` field.
- **Anthropic.** Requests send `anthropic-version: 2023-06-01`. Foundry does not support eager tool-input streaming, so tool input is collected and parsed when its block ends. Claude Opus and Sonnet 5.5 reject forced tool use, so structured output uses `output_config.format` instead of a forced JSON tool. Opus 4.7 and later, Claude 5 and the 5.5 models reject budget thinking (`thinking.type.enabled`); use `{ type: 'adaptive' }`.
- **Gemini.** Foundry rejects lower-case `thinkingLevel` values (HTTP 422). Streams have no terminal event, so the finish comes from `finishReason`, and a stream cut before it fails with `InvalidResponseError`. With tools, structured output is a synthetic `json` function the model is forced to call.
- **Chat Completions.** The route takes `max_completion_tokens`, not `max_tokens`; streams end without `[DONE]`; OpenAI models return no reasoning text, only reasoning token counts. GPT-6 Luna, GPT-6 Sol and GPT-6.1 Terra accept tools only with `reasoning_effort: 'none'`, which the adapter sends with tools unless `config` sets an effort.
- **Decisions.** Foundry rejects image URLs, so URL images fail with `InvalidUserInputError` before sending; base64 and data URLs work. A refusal without a decision name refuses every decision it left unanswered.
- **Embeddings.** Foundry rejects `dimensions` for `text-embedding-ada-002`, even at its native size, so a catalog model's native size is never sent.
- **Errors.** Foundry wraps vendor errors in its own envelope, with the vendor body in `parameters.responseBody` as `Optional[...]`. The adapters map status and codes to `AiError` reasons, read `retry-after` on 429, and keep Foundry's `errorName` and `errorInstanceId` under `foundry` in the error metadata.

## Out of scope

- Realtime audio, speech, transcription, image generation and reranking. `@shpitdev/foundry-ai` covers realtime for the AI SDK.
- Provider-defined tools (web search, code execution, MCP); they fail with `InvalidRequestError`.
- Prompt caching controls: Anthropic `cache_control` is not forwarded, and Foundry rejects OpenAI's `prompt_cache_key`.
- Anthropic `output_config.effort`, and PDF or plain-text documents.
- Decision `locate` questions, which Foundry's decisions route does not offer.
- xAI Chat Completions (the proxy rejects it), and Chat Completions for Anthropic, Google and xAI models.
- Catalog models without an adapter here: Gemma 4, Llama Nemotron Super, Schematic 7B, and the Snowflake and Llama embeddings.

## Run the live suite

From the repository root, after `infisical login`. The script runs under `infisical run`, which supplies `FOUNDRY_URL` and `FOUNDRY_TOKEN`.

```sh
pnpm run test:live:effect                                   # default models
LIVE_MODELS=anthropic pnpm run test:live:effect             # every Anthropic model
LIVE_MODELS=gpt-5.5,claude-opus-5.5 pnpm run test:live:effect
LIVE_MODELS=all pnpm run test:live:effect                   # catalog sweep
FOUNDRY_RECORD=1 pnpm run test:live:effect                  # re-record the default fixtures
```

The defaults are the models in each row of `test/matrix.ts`: `gpt-6-luna` for the OpenAI modules and decisions, `claude-haiku-4.5` plus `claude-sonnet-5.5` for native JSON, `gemini-3.1-flash-lite`, `grok-4-6`, all three embeddings, and one bad-token and one unknown-model request per vendor route. `LIVE_MODELS` takes a comma list of `all`, provider names (`openai`, `anthropic`, `google`, `xai`) or catalog model IDs; an unknown token fails the run. A sweep never records fixtures.

Test names are `<Module> live (<model>) > <cell>`. To run one cell, call Vitest directly so the pattern reaches it unchanged, and match the `>` separator:

```sh
LIVE_MODELS=gpt-5.5 infisical run --env=dev --silent -- pnpm exec vitest run \
  --config packages/foundry-effect-ai/vitest.live.config.ts -t 'OpenAiLanguageModel live \(gpt-5.5\) > tools$'
```

Each run writes Vitest's JSON report to `.memory/live/effect-<timestamp>.json`. Update this page from reviewed results, not raw reports.
