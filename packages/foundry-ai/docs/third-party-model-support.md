# Third-party model support

Use `createFoundryGoogle` for `gemini-3.7-flash` and `gemini-3.8-flash`. Use the third-party adapter for the selected Gemma, Kimi, Nemotron, Qwen, GLM, and Grok models:

```ts
import { createFoundryThirdParty } from '@nyrra/foundry-ai/third-party';
import { generateText } from 'ai';

const thirdParty = createFoundryThirdParty({ foundryUrl, token });
const result = await generateText({
  model: thirdParty('kimi-k2-5'),
  prompt: 'Explain what an ontology is in one sentence.',
});
```

The adapter uses the existing `@ai-sdk/openai` peer dependency. Both catalog aliases and their exact Foundry RIDs select the same verified route. Unknown model IDs are rejected because the RID alone cannot determine which proxy to use. `resolveModelProvider()` returns `third-party`; `modelCreator` identifies the creator separately from the proxy interface.

Foundry manages the upstream host and credentials. Bedrock, Fireworks, and NVIDIA credentials are not required. Enrollment does not imply compatibility with every proxy interface. See [Palantir's proxy documentation](https://www.palantir.com/docs/foundry/aip/llm-provider-compatible-apis).

## Routing and limitations

- Chat Completions: Kimi K2.5/K3, Qwen, and GLM. The adapter omits `store`, which this Foundry proxy rejects even when false.
- OpenAI Responses: Gemma and Nemotron 3 Ultra.
- xAI Responses: Grok. Foundry rejects the same RIDs on its OpenAI proxy. Assistant history is sent as text strings because the xAI proxy rejects `output_text` input parts.
- Llama 3.3 Nemotron Super 49B v1.5 is cataloged with `transport: 'unavailable'`. Foundry rejected both OpenAI-compatible routes with `LanguageModelNotAvailable`. Creating this model throws a descriptive error. This is a proxy limitation on the tested enrollment, not proof that native Foundry model execution is unavailable.

Responses requests set `store: false`; all routes reject `providerOptions.openai.store: true`. Provider options use the `openai` namespace because the adapter uses that SDK. No automatic endpoint failover is performed.

Grok streaming currently fails: Foundry's beta xAI stream emits text/reasoning deltas without the corresponding item-start events required by the SDK. This also affects streaming tool loops. Non-streaming results are assessed separately below.

Missing training dates, external URLs, and speed ratings remain undefined. Input types and vision flags for these additions reflect tested proxy capabilities, not a claim that every native model feature is available.

## Live verification

The capability matrix and retained run references are recorded below. Survey tests record failures without failing the Vitest process; the case statuses, rather than its exit code, determine support. These are bounded fixture probes on one enrollment, not reliability or load benchmarks.

<!-- capability-matrix -->

Tested September 13, 2026 with AI SDK 6.0.224, OpenAI adapter 3.0.84, and Google adapter 3.0.91. The [case-level snapshot](./third-party-capability-results.json) retains the source run for every result. It combines the initial survey with focused xAI history/tool reruns after the request fixes.

✓ passed; × failed the probe; R rejected by the proxy; — not tested. U means the adapter rejected the unavailable route before making a request. “Tools” uses non-streaming `ToolLoopAgent`; “JSON + tools” uses automatic tool selection with a three-step limit. Image input checks acceptance and a nonempty description, not visual accuracy.

| Model | Text | History | Stream | JSON | Tools | Stream tools | JSON + tools | Image input | Reasoning stream |
|---|---|---|---|---|---|---|---|---|---|
| `gemini-3.7-flash` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | — |
| `gemini-3.8-flash` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `gemma-4-31b` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | × |
| `gemma-4-26b-a4b` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | × |
| `kimi-k2-5` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | × |
| `kimi-k3` | ✓ | ✓ | ✓ | ✓ | ✓ | × | × | ✓ | ✓ |
| `llama-3-3-nemotron-super-49b-v1-5` | U | U | U | U | U | U | U | U | U |
| `nemotron-3-ultra-550b-a55b-nvfp4` | ✓ | ✓ | ✓ | × | ✓ | ✓ | ✓ | R | × |
| `qwen3-235b-a22b-2507` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × | R | × |
| `qwen3-32b` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × | R | × |
| `glm-5` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × | R | × |
| `glm-5-3` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × | R | ✓ |
| `glm-5-3-flash` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | × | ✓ | ✓ |
| `grok-4-3` | ✓ | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-4-5` | ✓ | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-4-6` | ✓ | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-420-non-reasoning-latest` | ✓ | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-420-reasoning-latest` | ✓ | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |
| `grok-build-0-1` | ✓ | ✓ | × | ✓ | ✓ | × | ✓ | ✓ | × |

All 18 usable models also passed raw-RID routing. Successful Tools and JSON + tools cases were checked for an executed `regulatorySignal` tool result with the expected `verified` status, not just matching text.

### Observed failures

- Gemini 3.7 repeatedly called the tool until the three-step limit and produced no final structured output. Gemini 3.8 completed that same probe.
- Kimi, Qwen, and GLM produced a different status than the actual tool result in the combined JSON + tools probe. Kimi K3 also failed the streaming tool-loop result check. This is an observed behavioral failure under the tested automatic tool selection, not a claim that forced tool selection cannot work.
- Gemma returned non-JSON text in the combined JSON + tools probe. Both models passed JSON output on its own.
- Nemotron 3 Ultra returned prose instead of the requested JSON schema. It also reported zero token usage on successful Responses calls; do not treat those zeros as evidence of zero token consumption. Image input was rejected by its backend.
- Both Qwen models, GLM-5, and GLM-5.3 rejected image input. GLM-5.3 Flash accepted it.
- Kimi K3 and GLM-5.3/5.3 Flash exposed reasoning in the streaming probe. The other chat/Responses routes did not expose reasoning events or a positive reasoning-token count in that probe. Grok's reasoning probe failed at stream parsing; that does not mean the underlying model lacks reasoning. Gemini reasoning visibility was not probed.
- All six Grok models failed streaming with missing text/reasoning-start events. Non-streaming history and tool workflows passed after normalizing assistant content and omitting assistant message IDs that the proxy rejects.

### Reproduce

Credentials can be supplied through the existing environment variables or the CLI's process-only credential injection:

```sh
foundry-cli account exec -- pnpm run test:live -- --catalog --provider third-party --no-update-docs
foundry-cli account exec -- pnpm run test:live -- --model google:gemini-3.7-flash --no-update-docs
foundry-cli account exec -- pnpm run test:live -- --model google:gemini-3.8-flash --no-update-docs
```

The canonical smoke remains limited to its original three providers; the catalog survey includes third-party models. Raw local request/response and telemetry evidence is under `.memory/capability-runs/<runId>/`; the checked-in snapshot omits headers, hostnames, and full prompts. These live runs used the feature working tree based on `60d10b7`; they are not evidence of an npm release or production deployment.
