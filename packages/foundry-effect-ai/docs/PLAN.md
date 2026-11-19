# Effect AI adapters: plan

`@shpitdev/foundry-effect-ai` gives Effect AI programs the Foundry coverage `@shpitdev/foundry-ai` gives the Vercel AI SDK: OpenAI, Anthropic, Google and xAI models through Foundry's LLM proxy, addressed by catalog alias or RID. It ships as one package whose only peer dependency is `effect`, and an application that uses one vendor bundles only that vendor's code.

Release candidates publish to npm's `next` tag as phases land; phase 8 cuts the first stable release. The scaffold, guardrails and protocol notes are in place; every public function is a stub that dies with a pointer to this file.

## Decisions

| Topic          | Decision                                                                                                                                                                                                 | Why                                                                                                                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Dependencies   | `effect` ^4.1.4 only. No vendor SDKs, no `@effect/ai-openai` or `@effect/ai-anthropic`.                                                                                                                  | Effect 4 ships the AI core (`effect/ai`), HTTP client (`effect/http`) and SSE decoder (`effect/encoding/Sse`). The upstream providers add 22k–77k-line generated schema files, and there is no Effect 4 Google provider. |
| Public surface | One module per vendor and model kind, imported by subpath: `@shpitdev/foundry-effect-ai/AnthropicLanguageModel`. No root entry, no barrel.                                                               | A barrel would pull every vendor into every bundle. This mirrors upstream Effect's deep-import style.                                                                                                                    |
| Module API     | `model(id)` returning `AiModel.Model`, plus `make` and `layer`, matching upstream providers. Per-model `Config` and `withConfigOverride` arrive with each implementation.                                | Users can swap an upstream provider for ours without restructuring their program.                                                                                                                                        |
| Transport      | One `FoundryClient` service with two operations, `json` and `sse`. It owns the URL, bearer token, attribution and trace headers, and maps failures to `AiError`.                                         | Protocol-typed client methods would put every schema into the shared module.                                                                                                                                             |
| Wire schemas   | Hand-written `effect/Schema` codecs under `src/internal/<protocol>/`, decoding only the fields we read; unknown stream events are ignored. Requests are plain interfaces.                                | Foundry deviates from vendor specs in small ways (omitted `object`, extra reasoning events), so strict generated schemas fail. Upstream also hand-writes its OpenAI client schemas.                                      |
| Vendor quirks  | Request shaping lives in the vendor module: `store: false`, strict function tools, forced reasoning, Anthropic structured-output mode, no eager tool-input streaming.                                    | Same rules as `packages/foundry-ai/src/providers`, driven by catalog metadata.                                                                                                                                           |
| Streaming      | Every language model implements both `generateText` and `streamText`.                                                                                                                                    | `LanguageModel.make` requires both.                                                                                                                                                                                      |
| xAI            | `XaiLanguageModel` reuses the Responses codec with an xAI dialect.                                                                                                                                       | Foundry serves Grok through Responses; the AI SDK adapter's `xai-compat.ts` rewrites are unnecessary with lenient decoding.                                                                                              |
| Build          | `tsc` emits ESM, one file per module, `sideEffects: false`.                                                                                                                                              | Effect 4 is ESM-only; per-file output lets bundlers drop unused modules without a pure-annotation pass.                                                                                                                  |
| Model catalog  | Moves to `packages/foundry-catalog` (workspace source with no `package.json`), compiled into both packages (phase 0a).                                                                                   | Depending on `@shpitdev/foundry-ai` would install the `ai` peer; a third published package would couple release lines.                                                                                                   |
| Upstream code  | Port logic (prompt conversion, stream state machines), not generated schemas. Each derived file starts with `// Adapted from @effect/ai-<x> (MIT), effect@4.1.4, 82904fe.`; the MIT text is in `NOTICE`. | Keeps attribution exact and auditable.                                                                                                                                                                                   |

## Target layout

```text
packages/foundry-catalog/src/       per-vendor model catalogs and types, moved from packages/foundry-ai (phase 0a)
packages/foundry-effect-ai/
  src/
    FoundryClient.ts                transport service, layer, layerConfig (FOUNDRY_* config)
    OpenAiLanguageModel.ts          Responses on /openai/v1/responses
    OpenAiDecisionModel.ts          /openai/v1/decisions (GPT-6 Luna)
    OpenAiEmbeddingModel.ts         /openai/v1/embeddings
    OpenAiChatLanguageModel.ts      /openai/v1/chat/completions, only if phase 7 proves a route
    AnthropicLanguageModel.ts       /anthropic/v1/messages
    GoogleLanguageModel.ts          /google/v1/models/{rid}:generateContent and :streamGenerateContent?alt=sse
    XaiLanguageModel.ts             /xai/v1/responses through the Responses codec
    internal/
      errors.ts                     HTTP status, error bodies, decode and SSE failures → AiError
      model.ts                      alias → RID against one vendor's catalog
      responses/                    schema.ts, request.ts, response.ts, stream.ts, languageModel.ts
      messages/                     schema.ts, request.ts, response.ts, stream.ts
      gemini/                       schema.ts, request.ts, response.ts, stream.ts
      decisions/                    schema.ts
      embeddings/                   schema.ts
      chat/                         schema.ts, request.ts, response.ts, stream.ts (phase 7)
  test/
    matrix.ts                       capability rows per module; drives both suites
    contract.test.ts                offline: recorded fixture in, golden request and decoded result out
    foundry.live.test.ts            the same cells against Foundry
    FakeFoundry.ts                  replaying HttpClient that captures requests
    capabilities.ts                 shared Effect programs per capability (phase 2)
    types.ts                        compile-time API contract
    fixtures/<Module>/<capability>.{json,sse}
  docs/
    PLAN.md                         this file
    protocols/                      wire contracts per protocol, with upstream line references
```

## Guardrails

`pnpm run verify` runs all of these for both packages; CI runs the same command.

| Check          | Command (Nx target)               | Enforces                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lint           | `foundry-effect-ai:lint`          | oxlint (`.oxlintrc.json`, strict, mirrors foundry-cli): no `any`, non-null assertions, default exports, cycles or barrels. Bans `ai`, `@ai-sdk/*`, `@effect/ai-*`, the `effect`, `effect/ai` and `effect/http` barrels, and `@shpitdev/foundry-ai`. Library code also bans `FetchHttpClient`, test tooling and `node:*`; `internal/` cannot import public modules. Type-aware rules run through oxlint-tsgolint; oxfmt checks formatting. |
| Typecheck      | `foundry-effect-ai:typecheck`     | TypeScript 7 `tsc`, patched by `@effect/tsgo` so Effect diagnostics (warnings included) fail it, with `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and friends: no `fetch`, `process.env`, `Date`, timers, `console`, `Math.random`, floating Effects or unlisted unstable APIs.                                                                                                                                              |
| Contract tests | `foundry-effect-ai:test`          | The support matrix. Each cell is `it.todo` until its phase lands.                                                                                                                                                                                                                                                                                                                                                                         |
| Tree-shaking   | `foundry-effect-ai:tree-shaking`  | Bundles each public module through the exports map with esbuild. Fails if the bundle reaches another protocol's `internal/` folder, another public model module or the all-vendor catalog; if it exceeds its byte budget; if `internal/*` resolves; or if a consumer cannot typecheck the module.                                                                                                                                         |
| Package audit  | `foundry-effect-ai:package-audit` | `effect` is the only peer; no dependencies, root entry or `index` files; no vendor SDK imports in `dist`; nothing from `src/`, `test/` or configs published.                                                                                                                                                                                                                                                                              |
| Release policy | `foundry-ai:release-policy-check` | Per-package Nx release groups and tags, the select-then-matrix release workflow, OIDC publishing.                                                                                                                                                                                                                                                                                                                                         |
| Old package    | `.oxlintrc.json` override         | `packages/foundry-ai` cannot import `effect`, `@effect/*` or the Effect package.                                                                                                                                                                                                                                                                                                                                                          |

## Testing approach

- One contract test per matrix cell, using `FakeFoundry.replay(fixture)`. It asserts the request (path, headers, body) and the decoded Effect AI result. Error mapping gets its own cells. No unit tests for individual helpers unless a bug needs one.
- Fixtures are real proxy bytes. Phase 1 adds `FOUNDRY_RECORD=1` to the live suite, which rewrites `test/fixtures/` with credentials redacted. The three xAI fixtures in `packages/foundry-ai/src/__tests__/fixtures` seed phase 3.
- The live suite runs the same cells over `FetchHttpClient` with one model per vendor (`pnpm run test:live:effect`). It needs `FOUNDRY_URL` and `FOUNDRY_TOKEN` and is never run in CI.
- A phase is done when its rows in `test/matrix.ts` have no todos and the live suite passes for its model.

## Phases

| Phase | Scope                                                                                                                                                         | Done when                                                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Scaffold, guardrails, release split, protocol notes                                                                                                           | Done: `pnpm run verify` is green.                                                                                                                                                                                                                    |
| 0a    | Move `packages/foundry-ai/src/models` and the model types to `packages/foundry-catalog`; both packages compile it in. Narrow `model(id)` to catalog ID types. | `@shpitdev/foundry-ai`'s public API and packed-library CI check are unchanged, and the tree-shaking check sees only the right vendor's catalog per module. Fall back to a copied catalog plus a `diff` check if tsup cannot inline the declarations. |
| 1     | `FoundryClient`, `internal/errors.ts`, fixture recording, `OpenAiDecisionModel`                                                                               | The seven decision cells pass offline and live.                                                                                                                                                                                                      |
| 2     | `OpenAiLanguageModel` (Responses) and `test/capabilities.ts`                                                                                                  | OpenAI row has no todos, including a recorded `reasoning_summary_part` stream; live passes on `gpt-6-luna`.                                                                                                                                          |
| 3     | `XaiLanguageModel`                                                                                                                                            | xAI row has no todos; live passes on `grok-4-6`.                                                                                                                                                                                                     |
| 4     | `AnthropicLanguageModel`                                                                                                                                      | Anthropic row has no todos, covering adaptive thinking and both structured-output modes; live passes.                                                                                                                                                |
| 5     | `GoogleLanguageModel`                                                                                                                                         | Gemini row has no todos; live passes. Highest risk: `effect/ai` has no Gemini structured-output codec.                                                                                                                                               |
| 6     | `OpenAiEmbeddingModel`                                                                                                                                        | All three catalog embedding models pass live.                                                                                                                                                                                                        |
| 7     | Chat Completions                                                                                                                                              | Starts only after a live probe shows a Foundry route accepting `/chat/completions`. Today every OpenAI alias serves Responses and xAI chat returns HTTP 400.                                                                                         |
| 8     | Stable release                                                                                                                                                | Full-catalog live sweep recorded in a package `docs/README.md`; `pnpm run release foundry-effect-ai` (see [RELEASING.md](../../../docs/RELEASING.md)).                                                                                               |

## Per-phase checklist

1. Read [the provider contract](protocols/effect-provider-contract.md) and the protocol note for the phase.
2. Port from the cited upstream ranges; add the attribution header to derived files.
3. Replace the stub bodies. Delete `src/internal/notImplemented.ts` with the last stub.
4. Record fixtures live, then replace the phase's todos with contract and live tests.
5. Set the module's budget in `scripts/check-tree-shaking.mjs` to its measured size plus about 20%.
6. Run `pnpm run verify` and `pnpm run test:live:effect`.

## Open questions

- Whether tsup inlines declarations from `packages/foundry-catalog` into `@shpitdev/foundry-ai`'s `.d.ts` files (phase 0a).
- Which Foundry response deviations need lenient decoding beyond those already known; capture fixtures before relaxing a schema.
- Gemini structured output: the default codec transformer or a Gemini-specific JSON Schema subset (phase 5).
- Whether any Foundry route serves Chat Completions (phase 7).
