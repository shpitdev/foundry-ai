# OpenAI Decisions (GPT-6 Luna)

**Route:** POST `${foundryUrl}/api/v2/llm/proxy/openai/v1/decisions`. One JSON response; no streaming/SSE, Prompt, tool loop, or LanguageModel Response parts. Use `DecisionModel.make({decide, supportsImages:true, probabilityPrecision:2})` (no Locate).

## Request: DecisionModel → wire

- `{model,input,questions}`. Hook receives `{state,decisions,images?}`; core has already encoded state to JSON and extracted image references. Upstream sends string state verbatim, JSON-stringifies other state; with images use `input:[{role:"user",content:[{type:"input_text",text},…]}]`. Add a text label `Image <reference>:` then `{type:"input_image",image_url:"data:<mediaType>;base64,…"}` for each extracted image. Fail hosted URLs/file IDs with `InvalidUserInputError` before sending.
- The Foundry-tested Vercel peer always uses the user-message array (object JSON can use `{type:"input_json",data}`); JSON-as-text is the Effect reference and what the adapter sends. Foundry accepts a direct string `input` (phase 1 live cells).

| Effect decision | Question (each includes unique `name`, `instructions`)                              |
| --------------- | ----------------------------------------------------------------------------------- |
| `Probability`   | `type:"predicate"`; append `false:` / `true:` criteria to instructions if supplied. |
| `Classify`      | `type:"choice",choices:[{value,description?}]` from label keys.                     |
| `Rate`          | `type:"score",levels:[{label,description?}]`, lowest first.                         |

- Structured instructions/descriptions → JSON strings; omit absent (`null`) descriptions like the installed peer, instead of literal `"null"` as in upstream Effect. No client-side limit checks: core rejects too few labels, levels or decisions, and Foundry's HTTP 400 covers the rest (PLAN.md, Decision model). Optional `safety_identifier` is Foundry-tested; only include if adapter exposes it.

## Response: wire → ProviderResponse

- Decode `{answers,usage?,model?,id?}`; key answers by question name. `predicate`→`{_tag:"Probability",probability}`; `choice`→`{_tag:"Classify",label:choice,probabilities,confidence?}`; `score`→`{_tag:"Rate",rating:score,probabilities,confidence?}`. Score is fractional (0-based weighted average), not a label; map integer probability `value` indices through original criterion labels. `refusal`→`{_tag:"Refusal"}`. Carry `usage.input_tokens` and `output_tokens`, optional response model/ID and raw subcounts in metadata.
- Use Foundry peer's more tolerant response shape: `confidence` may be absent/null, score probability `label` isn't required, usage and its counts may be absent/null. A refusal with a null name returns `Refusal` for every unanswered decision (PLAN.md, Decision model). Core ignores unknown names; an out-of-range score index is dropped, so core reports that distribution invalid. Leave unanswered keys absent for core `decideSettled`; core handles answer-kind/distribution checks and turns named refusals into `ContentPolicyError` for `decide`.
- Errors: input/range/unsupported image → `InvalidUserInputError`; HTTP via OpenAI mapper (404 `LanguageModelNotAvailable` → `InvalidRequestError`, 429 throttle/quota split, 5xx provider error); malformed successful JSON → `InvalidResponseError`, unusable decoded answers → `InvalidOutputError` or core settled outcome. No `finish` or `usage` parts.

## Foundry specifics

- `packages/foundry-ai/src/providers/openai.ts:39–56,82–92`, `models/openai-models.ts:385–405,573–576`, `models/catalog.ts:40–47`: only verified target `gpt-6-luna` → `ri.language-model-service..language-model.gpt-6-luna`; Bearer + optional `attribution`, `traceParent`, `traceState`. No Responses middleware (`store`, function strictness, `forceReasoning`) on Decisions. No AI SDK peer dependency in the new adapter.
- `packages/foundry-ai/docs/README.md:113–130` and `packages/foundry-ai/src/__tests__/decisions.live.test.ts:18–171`: 400 works; other tested models 404; hosted image URLs rejected; `prompt_cache_key` and `prompt_cache_options` rejected (leave unset). Implicit caching reported; optional `X-Palantir-session-id` for routing affinity. This task did not run live probes; Effect-specific payload combinations and actual frequency of optional fields **UNVERIFIED**.

## Port from (reference only)

- `packages/ai/openai/src/OpenAiSchema.ts:1470–1640`: codec discriminants and image input. `packages/ai/openai/src/OpenAiDecisionModel.ts:33–186`: Effect adapter and question/image/answer mapping. `packages/ai/openai/src/OpenAiClient.ts:322–357` and `packages/ai/openai/src/internal/errors.ts:23–315`: JSON POST and error mapping.
- `packages/effect/src/ai/DecisionModel.ts:100–110,182–287,350–380,393–544,583–657`: extracted images, provider options and validation/settlement. `node_modules/@ai-sdk/openai/src/openai-decision-model.ts:32–86,123–310`: Foundry peer request and response differences.
