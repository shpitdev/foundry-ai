# @nyrra/foundry-ai

Thin Palantir Foundry adapters and model catalog for the Vercel AI SDK.

[![CI](https://github.com/shpitdev/foundry-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/shpitdev/foundry-ai/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/%40nyrra%2Ffoundry-ai/latest)](https://www.npmjs.com/package/@nyrra/foundry-ai)

- [Install and use the package](./packages/foundry-ai/README.md)
- [Models and test status](./packages/foundry-ai/docs/README.md)
- [Runnable examples](./examples/README.md)
- [Release process](./docs/RELEASING.md)

## Development

Use Node.js 24 and the pnpm version declared in `package.json`.

```sh
pnpm install --frozen-lockfile
pnpm run verify
```

`verify` runs release-policy checks, Biome, Vitest, typecheck, build, and package-content audit through Nx. CI also tests the packed library with AI SDK 6, SDK 7 stable, and the supported late SDK 7 beta line.

| Test layer | Coverage | CI |
|---|---|---|
| Unit | Config, catalog, adapter behavior | Yes |
| Integration | Offline SDK tool loop, packed-library compatibility | Yes |
| API end-to-end | Manual live Vitest suite against Foundry | No; requires credentials |
| Web end-to-end | None | No |

Run `pnpm run test:live` for the default live models, or `LIVE_MODELS=gpt-6-luna pnpm run test:live` for one model. `LIVE_MODELS=all` surveys the catalog. The [test status page](./packages/foundry-ai/docs/README.md) explains selection and evidence limits.

Provider factories stay thin: config and catalog exports live at the package root, provider clients use separate subpaths, and applications compose registries with AI SDK `createProviderRegistry`.

Copyright 2026 SHPIT LLC. [Apache-2.0](./LICENSE). See [security reporting](./SECURITY.md).
