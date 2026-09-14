# Models and live test status

**Tested September 14, 2026 (UTC), on stable AI SDK 7.0.97:** OpenAI provider 4.0.65, Anthropic 4.0.52, and Google 4.0.67. The survey covers all 57 language-model aliases and both OpenAI embedding models in this catalog. Basic text passed on 55 language models; two had proxy access/route failures. Both embeddings passed. Other capabilities have failures or skips as shown below.

[Install and configure](../README.md). [Case-level results and rerun history](./capability-results.json). Results apply to the tested Foundry account/enrollment, not every stack or production deployment. Tests run manually; CI does not call Foundry.

## Results

✓ passed; × probe failed; T rate-limited after SDK retries; R proxy rejected; A disabled for this account; U no usable adapter route; — not tested. A catalog entry alone does not prove feature support.

Tools uses non-streaming `ToolLoopAgent`; stream tools uses `streamText`. JSON + tools requires an executed tool result and matching final structured output with automatic tool selection and a three-step limit. The JSON also includes conversation-history and raw-RID routing probes. Image checks acceptance and a nonempty description, not visual accuracy. Reasoning checks stream events or token usage; it does not rate reasoning quality.

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
| `nemotron-3-ultra-550b-a55b-nvfp4` | ✓ | ✓ | × | ✓ | ✓ | ✓ | R | × |
| `gemma-4-26b-a4b` | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | × |
| `qwen3-235b-a22b-2507` | ✓ | ✓ | ✓ | ✓ | ✓ | × | R | × |
| `qwen3-32b` | ✓ | ✓ | ✓ | × | ✓ | × | R | × |
| `glm-5` | ✓ | ✓ | ✓ | ✓ | ✓ | × | R | × |
| `glm-5-3` | ✓ | ✓ | ✓ | ✓ | ✓ | × | R | ✓ |
| `glm-5-3-flash` | ✓ | ✓ | × | ✓ | ✓ | × | ✓ | ✓ |
| `grok-4-3` | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-4-5` | ✓ | × | ✓ | × | × | ✓ | ✓ | × |
| `grok-4-6` | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-420-non-reasoning-latest` | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-420-reasoning-latest` | ✓ | × | ✓ | ✓ | × | × | ✓ | × |
| `grok-build-0-1` | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |

### Embeddings

| Model | Probe | Dimensions |
|---|---|---:|
| `text-embedding-3-small` | ✓ | 1536 |
| `text-embedding-3-large` | ✓ | 3072 |

## Findings

- **Catalog freshness:** checked against `foundry-cli models list --json` on September 14, 2026. All retained entries are listed as GA or Experimental; Sunset and delisted entries are excluded. The JSON includes the CLI lifecycle snapshot. Embeddings match by model identifier because their proxy names differ from enrollment RIDs.
- **Enrollment versus proxy access:** Claude Opus 4.1 and Llama Nemotron Super are still listed as GA. The live proxy rejected Opus 4.1 as `DisabledForUser`, and Nemotron Super has no usable configured proxy route. Enrollment does not guarantee proxy compatibility.
- **Streaming:** all six Grok models fail SDK stream parsing with missing text/reasoning-start events. Several OpenAI reasoning probes also fail because Foundry emits incomplete `response.reasoning_summary_part.added` events, even where ordinary text streaming passed.
- **Anthropic settings:** set an explicit `maxOutputTokens`; the SDK default exceeds some Foundry backend limits. The blocking tool probes passed on available Claude models with a 420-token limit. Use adaptive thinking for Opus 4.7/4.8 and Claude 5.
- **Structured output and tools:** Gemma, Kimi, Qwen, and GLM have failures in the combined automatic-tool-selection probe. Some runs omit the required tool execution. GLM 5.3 Flash standalone JSON and Grok 420 Reasoning combined output also failed in the latest probes. These outcomes do not establish that forced tool selection is unsupported.
- **Blocking tool output:** Qwen 3-32B executed its tool but missed the requested response marker. Kimi K3 passed its blocking tool probe on an isolated retry after previously skipping execution; Grok 4.5 skipped execution in its recorded probe.
- **Image and reasoning limits:** Qwen, GLM-5/5.3, and Nemotron Ultra reject image input. Several third-party models expose no reasoning signal in the tested stream; that does not mean they cannot reason. Google reasoning is not probed by this harness.
- **Evidence corrections:** Codex Mini's tool/image probes passed after increasing their token budgets. The JSON probe now checks its declared schema, and reasoning requires events or token usage rather than matching prose. Embedding IDs are excluded from language-model probes. The JSON retains earlier outcomes alongside focused reruns.
- **Focused retries:** reran all 15 previously rate-limited model/capability pairs individually, spacing successive probes for the same model by 65 seconds. Thirteen passed; GPT-5 and GPT-5 Nano reasoning probes reached the proxy but failed on incomplete `response.reasoning_summary_part.added` events. No rate-limited cases remain in the latest results. Earlier failures remain in the JSON history.

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

Only OpenAI exposes `embeddingModel()` and `embedding()`. Embedding strings pass through without language-model RID routing. Image generation, speech, transcription, video, and reranking are not exposed.

## Run manually

With `FOUNDRY_URL` and `FOUNDRY_TOKEN` set, from the repository root:

```sh
pnpm run test:live -- --catalog
pnpm run test:live:summary
```

Use `--provider anthropic` or `--model openai:gpt-5-nano` for a focused run. To rerun a single case, add `--testNamePattern 'openai:gpt-5-nano: deterministic tool loop$'`. Raw reports stay in `.memory/capability-runs/<runId>/` and record the installed SDK versions. Read the case statuses: survey failures need not fail the test process. Update this overview from reviewed results; do not replace it with raw reports.
