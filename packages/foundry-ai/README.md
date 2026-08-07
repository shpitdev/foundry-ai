# @nyrra/foundry-ai

Thin Palantir Foundry provider adapters and model catalog for the Vercel AI SDK.

[![AI%20SDK](https://img.shields.io/badge/AI%20SDK-6%20%7C%207-000000?logo=vercel&logoColor=white)](https://ai-sdk.dev/)
[![npm](https://img.shields.io/npm/v/%40nyrra%2Ffoundry-ai/latest?logo=npm&label=npm)](https://www.npmjs.com/package/@nyrra/foundry-ai)
[![next](https://img.shields.io/npm/v/%40nyrra%2Ffoundry-ai/next?logo=npm&label=next)](https://www.npmjs.com/package/@nyrra/foundry-ai?activeTab=versions)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/shpitdev/foundry-ai)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.0.2-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/license-Apache--2.0-0f172a)](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/LICENSE)

## What It Does

- Routes AI SDK language-model calls and OpenAI embeddings through Foundry's provider-compatible proxy endpoints.
- Maps friendly model aliases such as `gpt-5.6-terra`, `claude-opus-5`, and `gemini-3.6-flash` to Foundry RIDs.
- Keeps installs lean by exposing provider-specific subpaths and optional peer dependencies.
- Ships a TanStack Intent skill for provider-specific setup and troubleshooting.

## Install

Install `ai`, this package, and only the provider peer dependency you need:

```bash
pnpm add @nyrra/foundry-ai ai @ai-sdk/openai
```

```bash
pnpm add @nyrra/foundry-ai ai @ai-sdk/anthropic
```

```bash
pnpm add @nyrra/foundry-ai ai @ai-sdk/google
```

If you use more than one provider, install both peers. For the rationale and bundle-size tradeoffs, see the [dependency strategy guide](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/docs/dependency-strategy.md).

Supported combinations are AI SDK v6 with provider packages v3, and AI SDK v7 stable releases (or the supported late v7.0 beta line from `7.0.0-beta.187`) with provider packages v4.

## Package Identity

The source repository is `shpitdev/foundry-ai`; the existing npm identity remains `@nyrra/foundry-ai`. Consumers do not need to change their dependency or imports because of the repository transfer. Releases are published from GitHub Actions with npm provenance.

## Agent Skill

Install the published agent skill with:

```bash
npx skills add https://github.com/shpitdev/foundry-ai --skill foundry-ai-provider
```

That flow lets the `skills` CLI prompt for scope and agent links interactively. The install event is what `skills.sh` uses for leaderboard/indexing. In TanStack Intent consumer repos, install `@nyrra/foundry-ai` directly, run `npx @tanstack/intent@latest list`, and map `node_modules/@nyrra/foundry-ai/skills/foundry-ai-provider/SKILL.md` in your agent config.

## Verified Use Case

Use this package when you want local development and deployed server workloads to call secure or private Foundry proxy endpoints instead of public provider endpoints directly.

The verified path today is env-based server usage with `FOUNDRY_URL` and `FOUNDRY_TOKEN`. Palantir documents the same proxy family for OSDK and other Foundry-native runtimes, but this package has not yet been validated end to end in Palantir TSv1 or TSv2 standalone functions or `PlatformClient`-driven fetch flows.

## Quick Start

```bash
FOUNDRY_URL=https://your-stack.palantirfoundry.com
FOUNDRY_TOKEN=your-token
FOUNDRY_ATTRIBUTION_RID=
FOUNDRY_TRACE_PARENT=
FOUNDRY_TRACE_STATE=
```

```ts
import { loadFoundryConfig } from '@nyrra/foundry-ai';
import { createFoundryOpenAI } from '@nyrra/foundry-ai/openai';
import { generateText } from 'ai';

const openai = createFoundryOpenAI(loadFoundryConfig());

const result = await generateText({
  model: openai('gpt-5-mini'),
  prompt: 'Reply in one sentence.',
});

console.log(result.text);
```

## Provider Surface

- Root exports config loading, catalog helpers, errors, and model ID types.
- `@nyrra/foundry-ai/openai` exports `createFoundryOpenAI`.
- `@nyrra/foundry-ai/anthropic` exports `createFoundryAnthropic`.
- `@nyrra/foundry-ai/google` exports `createFoundryGoogle`.
- There is no package-level registry helper. Compose multi-provider routing in application code with AI SDK `createProviderRegistry`.

## Model IDs

- Use friendly aliases for catalogued models such as `gpt-5.6-terra`, `claude-opus-5`, and `gemini-3.6-flash`.
- Use raw Foundry RIDs when your stack exposes a model that is not yet in the package catalog.
- Sunset and deprecated enrollment entries are intentionally excluded from the public alias catalog.
- `getModelMetadata()` exposes normalized catalog data for current aliases, including `modelIdentifier`, `inputTypes`, `trainingCutoffDate`, `performance`, and derived `supportsVision` / `supportsResponses` flags.
- Alias and raw-RID behavior are documented in the [model support guide](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/docs/model-support.md).

## Foundry-Specific Behavior

- OpenAI traffic always uses Foundry-safe compatibility defaults where required.
- `providerOptions.openai.store=true` throws before the request is sent.
- Known OpenAI reasoning aliases automatically get `providerOptions.openai.forceReasoning=true` unless the caller already set it.
- The Google adapter rewrites the AI SDK's `x-goog-api-key` auth into the bearer-token header that Foundry expects.
- OpenAI `embeddingModel()` and `embedding()` provide typed aliases for `text-embedding-3-small` and `text-embedding-3-large`, while other plain OpenAI model strings pass through unchanged. Embeddings do not use Foundry RID routing. Other embedding providers and image, audio, video, and rerank methods are not exposed.

## Docs And Examples

- [Usage guide](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/docs/usage.md)
- [Model support guide](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/docs/model-support.md)
- [Dependency strategy guide](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/docs/dependency-strategy.md)
- [Harness capability results](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/docs/harness-capability-results.md)
- [AI SDK community provider draft](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/docs/ai-sdk-community-provider.mdx)
- [TanStack Intent skill](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/skills/foundry-ai-provider/SKILL.md)
- [Examples overview](https://github.com/shpitdev/foundry-ai/blob/main/examples/README.md)
- [Published base examples](https://github.com/shpitdev/foundry-ai/tree/main/packages/foundry-ai/skills/foundry-ai-provider/references/examples)

## Testing And CI

| Layer | Present | Tooling | Runs in CI |
|---|---|---|---|
| unit | yes | Vitest | yes |
| integration | no | none | no |
| e2e api | yes | live Vitest suite + manual example scripts against Foundry | no |
| e2e web | no | none | no |

CI runs lint, unit tests, typecheck, build, TanStack Intent skill validation, and a package-content audit. The harness matrix remains manual through `pnpm test:live`.

## Copyright And License

Copyright 2026 SHPIT LLC

Licensed under Apache-2.0. See the [license](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/LICENSE) and [notice](https://github.com/shpitdev/foundry-ai/blob/main/packages/foundry-ai/NOTICE).
