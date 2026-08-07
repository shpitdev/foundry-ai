# Dependency Strategy

## Why `ai` and provider SDKs are peer dependencies

`@nyrra/foundry-ai` is intentionally thin. It ships:

- Foundry config loading
- alias-to-RID catalog helpers
- provider-specific adapter factories
- Foundry-specific compatibility behavior

It does not bundle the AI SDK runtime or every provider SDK. Keeping those packages as peers lets application code control versions and install only the providers it actually uses.

## What to install

| Use case | Packages |
|---|---|
| OpenAI through Foundry | `@nyrra/foundry-ai`, `ai`, `@ai-sdk/openai` |
| Anthropic through Foundry | `@nyrra/foundry-ai`, `ai`, `@ai-sdk/anthropic` |
| Google through Foundry | `@nyrra/foundry-ai`, `ai`, `@ai-sdk/google` |
| Multi-provider app | `@nyrra/foundry-ai`, `ai`, and every provider peer you actually route to |

## Why this keeps installs lean

- The package exposes provider-specific subpaths instead of a single all-in-one runtime surface.
- The provider peers are marked optional so you are not forced to install providers you do not use.
- The build externalizes `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, and `@ai-sdk/google`, so those packages stay in the host app's dependency graph instead of being rebundled here.
- The package does not export a registry helper, which avoids forcing all provider peers into every install.

## Practical implications

- If you only use OpenAI through Foundry, do not install the Anthropic or Google peers.
- If you add a second provider later, install that peer explicitly and keep routing in your application code.
- Unknown model strings still pass through as raw Foundry RIDs, but the provider package itself still must be installed for the subpath you import.

## Version expectations

- Use matching SDK generations: AI SDK v6 with provider packages v3, or AI SDK v7 with provider packages v4.
- The supported prerelease floor is AI SDK `7.0.0-beta.187`, with `@ai-sdk/openai` `4.0.0-beta.77`, `@ai-sdk/anthropic` `4.0.0-beta.69`, or `@ai-sdk/google` `4.0.0-beta.85`. Earlier betas used incompatible specification shapes.
- The adapter derives its language-model specification version from the installed AI SDK and provider instead of hard-coding v3.
- Keep `ai` and the provider peers within the declared major ranges. When adopting a new major, re-run package tests and the live capability suite before claiming support.
- Applications that want stricter version control should pin exact peer versions in their own repository rather than expecting this package to carry them transitively.
