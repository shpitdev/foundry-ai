# Chat Completions (generic and xAI)

**Routes:** POST `${foundryUrl}/api/v2/llm/proxy/xai/v1/chat/completions` for xAI. Generic OpenAI-compatible client POSTs `/chat/completions` to its configured base. `${foundryUrl}/api/v2/llm/proxy/openai/v1/chat/completions` is **UNVERIFIED**; the Foundry OpenAI wrapper exposes Responses, not Chat. See [shared Effect contract](effect-provider-contract.md).

## Request and Prompt
- Send `model`, `messages`, optional supported `temperature`, `top_p`, `seed`, `tools`, `tool_choice`, `response_format`. Effect compat uses `max_tokens`; xAI uses `max_completion_tokens`, `reasoning_effort` and (if exposed) `parallel_function_calling`; use explicit dialect flags, not inference from a Foundry RID. SSE adds `stream:true,stream_options:{include_usage:true}` (make usage request configurable for generic hosts that don't implement it).
- System → `role:"system"` + string; `developer` only for compatible models that require it. User → string or `content` parts `text` / `image_url:{url,detail?}`; images can be data URLs. Compat also has `file` for PDF; xAI peer only encodes supported images for file input. Actual Foundry Chat multimodal support **UNVERIFIED**.
- Assistant → one message: concatenate text, use `content:null` when tool-only (xAI peer omits empty text), `tool_calls:[{id,type:"function",function:{name,arguments:JSON.stringify(params)}}]`. Compat can replay reasoning with its original `reasoning` or `reasoning_content` field and preserve call `extra_content`; xAI peer reads `reasoning_content` but does not replay reasoning. Skip provider-executed assistant pairs unless a separate dialect supports replay.
- Tool result → `{role:"tool",tool_call_id:id,content}`; prefer textual `modelOutput`, else string/JSON stringify `result`. Don't silently drop nontext outputs if the caller expects them; reject unsupported media. Approval response is local, not a Chat message.
- Function definitions nested as `{type:"function",function:{name,description?,parameters,strict?}}`; named tool choice `{type:"function",function:{name}}`, otherwise `auto`/`none`/`required`; filter `oneOf` first. JSON: `response_format:{type:"json_schema",json_schema:{name,description?,schema,strict}}` using `toCodecOpenAI`; `json_object` is untyped JSON, not schema enforcement. Foundry OpenAI Responses defaults do not automatically apply here.

## Response and stream
- JSON: emit metadata from `id`, `model`, `created` Unix seconds if present. Single candidate `choices[0]`; map `message.reasoning`/`reasoning_content`, `content`, then `tool_calls` with parsed args. `refusal` → metadata, not output text. Provider tools/results are not standard Chat function parts; Toolkit emits local `tool-result`.

| SSE data (no named-event dispatch) | Effect parts / state |
|---|---|
| First valid chunk | Emit `response-metadata` once; role-only deltas carry no content. |
| `choices[0].delta.reasoning` / `.reasoning_content`, `.content` | Lazy start and stable ID per reasoning/text block, emit deltas; close reasoning when text starts (xAI also closes it before tools), close any open blocks on termination. Keep optional refusal fragments in finish metadata. |
| `.delta.tool_calls[]` | Key by tool `index`; retain first ID, name; concatenate `function.arguments` strings. Emit params start before first delta. On completion, securely parse, emit params end then exactly one `tool-call` per index. Don't treat one parseable intermediate buffer as proof a call is complete. |
| `choices[0].finish_reason`, then possible usage-only chunk (`choices:[]`), then `data: [DONE]` | Save reason, update latest usage separately even on empty choices. Emit one finish after calls and usage. Compat finalizes at `[DONE]`; native xAI finalizes on stream flush. Only accept EOF without sentinel for a dialect with another valid completion signal; never turn bare early EOF into `stop`. |

- Finish: `stop`, `length`, `tool_calls`/`function_call`→`tool-calls`, `content_filter`→`content-filter`; refusal + stop → `content-filter` (compat), absent reason with calls → `tool-calls`; preserve raw unmapped reasons.
- Generic usage `prompt_tokens`/`completion_tokens` are totals; subtract `prompt_tokens_details.cached_tokens` and `completion_tokens_details.reasoning_tokens` for uncached/text. xAI peer instead treats `completion_tokens` as text and adds reasoning for total; cache includes/excludes heuristic as in [Responses](openai-responses.md). Don't sum cumulative usage frames.
- Errors: shared HTTP mapper; inspect `{error:...}` in SSE before treating a chunk as unknown. xAI peer also handles 2xx JSON `{error:string,code?}` instead of SSE; map service-unavailable to `InternalProviderError`, malformed success body to `InvalidResponseError`. Invalid tool JSON → `ToolParameterValidationError`. Don't copy compat's silent filter of malformed JSON frames.

## Foundry specifics
- `providers/xai.ts:21–67`, `providers/xai-compat.ts:3–11`, `models/xai-models.ts:5–106`, `models/catalog.ts:20–47`: xAI `chat()` is explicit, default is Responses; aliases resolve to RID, raw targets pass through, known other-provider targets rejected. Bearer + optional `attribution`, `traceParent`, `traceState`. Reject `xai.store:true`, omit `store` on Chat. No Responses request/response rewrites on Chat. Do not silently fall back between routes.
- **Not supported in last recorded sweep:** all seven xAI Chat text probes returned HTTP 400; Responses worked (`packages/foundry-ai/docs/README.md:77–90`). Current availability for any other enrollment **UNVERIFIED**; keep opt-in and test before claiming Foundry support.

## Port from (reference only)
- `packages/ai/openai-compat/src/OpenAiClient.ts:181–252,960–1104,1144–1230,1296–1322`: wire messages, codecs, POST/SSE sentinel.
- `packages/ai/openai-compat/src/OpenAiLanguageModel.ts:614–709,772–953,984–1087,1089–1308,1385–1583,1626–1782,1796–1806,1832–1898`: serialization, reasoning, tool state, finish/usage. Build the Chat request directly rather than introducing its intermediate Responses shape.
- `packages/ai/openai-compat/src/internal/errors.ts:21–275`, `packages/ai/openai-compat/src/internal/utilities.ts:3–28`: map status and finish.
- Native peer: `node_modules/@ai-sdk/xai/src/xai-chat-language-model.ts:127–220,253–363,368–430,464–665,674–778`; `node_modules/@ai-sdk/xai/src/convert-to-xai-chat-messages.ts:27–178`; `node_modules/@ai-sdk/xai/src/convert-xai-chat-usage.ts:4–27`.
