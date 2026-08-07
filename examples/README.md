# Examples

Run every example from the repo root.

Bun is the recommended path. The scripts auto-load `.env.local` when `FOUNDRY_URL` and `FOUNDRY_TOKEN` are not already set in the environment.

## Base vs Advanced

`examples/base/` is a symlink to the published skill reference examples:

- `examples/base/provider-registry.ts`
- `examples/base/tool-calling.ts`
- `examples/base/tool-calling-streaming.ts`

`examples/advanced/` stays repo-only:

- `examples/advanced/basic-text.ts`
- `examples/advanced/streaming.ts`
- `examples/advanced/structured-output.ts`
- `examples/advanced/tool-calling-devtools.ts`
- `examples/advanced/tool-calling-parallel-devtools.ts`

## Required Env

- `FOUNDRY_URL`
- `FOUNDRY_TOKEN`
- `FOUNDRY_ATTRIBUTION_RID` — optional
- `FOUNDRY_TRACE_PARENT` — optional W3C traceparent value
- `FOUNDRY_TRACE_STATE` — optional W3C tracestate value
- `EXA_API_KEY` — required for the `tool-calling-*-devtools` examples

## Running Examples

The pattern is the same for every example:

```bash
# Safe runner (builds first)
pnpm run example <name> [args...]

# Bun direct (skips rebuild)
bun examples/<base|advanced>/<name>.ts [args...]
```

Provider/model overrides are supported by `streaming`, `structured-output`, `tool-calling`, and `tool-calling-streaming`.

Supported provider arguments are `openai`, `anthropic`, and `google`.

### Available examples

| Name | Path | Notes |
|---|---|---|
| `basic-text` | `advanced/basic-text.ts` | Blocking `generateText` with a fixed OpenAI model |
| `streaming` | `advanced/streaming.ts` | `streamText` with provider options |
| `structured-output` | `advanced/structured-output.ts` | Zod schema output |
| `tool-calling` | `base/tool-calling.ts` | Blocking tool loop (published skill) |
| `tool-calling-streaming` | `base/tool-calling-streaming.ts` | Streaming tool loop (published skill) |
| `tool-calling-devtools` | `advanced/tool-calling-devtools.ts` | DevTools instrumentation with Exa web search and a fixed Anthropic model |
| `tool-calling-parallel-devtools` | `advanced/tool-calling-parallel-devtools.ts` | `ToolLoopAgent` with parallel Exa research, step summaries, and DevTools capture |
| `provider-registry` | `base/provider-registry.ts` | Single registry, multiple providers via `provider:model` strings |

### Quick shortcuts

```bash
bun run example:devtools               # single-company DevTools instrumentation
bun run example:devtools:parallel      # parallel multi-company DevTools instrumentation
```

### Model override

Pass a third argument to force a specific model:

```bash
pnpm run example streaming anthropic claude-sonnet-5
bun examples/advanced/structured-output.ts google gemini-3.6-flash
```

## DevTools

The `*-devtools` examples capture every SDK generation to `.devtools/generations.json`. Start the viewer in a separate terminal:

```bash
npx @ai-sdk/devtools
```

Then open `http://localhost:4983` (or set `AI_SDK_DEVTOOLS_PORT` to use a different port).

## Notes

- `base/tool-calling.ts` and `base/tool-calling-streaming.ts` ship inside the published skill.
- The DevTools instrumentation examples use `claude-sonnet-5` with adaptive summarized reasoning and Foundry-compatible tool options.
- Google examples use friendly aliases because the package maps verified Gemini aliases to Foundry RIDs.
- The safe runner resolves short names through `examples/base/` first, then `examples/advanced/`.
