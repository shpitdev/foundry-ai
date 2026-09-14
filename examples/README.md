# Examples

From the repository root, set `FOUNDRY_URL` and `FOUNDRY_TOKEN` (or put them in `.env.local`), then run:

```sh
pnpm run example tool-calling openai
```

The runner builds first and uses Bun when installed, otherwise Node with tsx.

| Example name | Purpose |
|---|---|
| `basic-text` | Blocking text generation |
| `streaming` | Streaming text |
| `structured-output` | Zod schema output |
| `tool-calling` | Blocking tool loop |
| `tool-calling-streaming` | Streaming tool loop |
| `provider-registry` | Multiple providers with `provider:model` IDs |
| `tool-calling-devtools` | Exa search with DevTools capture |
| `tool-calling-parallel-devtools` | Parallel Exa research with step summaries |

`streaming`, `structured-output`, `tool-calling`, and `tool-calling-streaming` accept a provider (`openai`, `anthropic`, or `google`) and optional model:

```sh
pnpm run example streaming anthropic claude-sonnet-5
```

DevTools examples additionally require `EXA_API_KEY`. They write `.devtools/generations.json`; run `pnpm exec devtools` to open the viewer at `http://localhost:4983`.

`base/` links to the package's published skill examples; `advanced/` contains repo-only examples. See [models and test status](../packages/foundry-ai/docs/README.md) before choosing a model for a feature.
