# Protocol contracts

Implementation notes for each wire protocol the package speaks, written before any adapter code. Read [the Effect provider contract](effect-provider-contract.md) first, then the protocol for your phase.

- [Effect provider contract](effect-provider-contract.md): what `LanguageModel.make`, `DecisionModel.make` and `EmbeddingModel.make` expect, response and stream parts, `AiError` mapping.
- [OpenAI Responses](openai-responses.md): OpenAI and xAI, JSON and SSE, stateless replay with `store: false`.
- [OpenAI Decisions](openai-decisions.md): GPT-6 Luna questions and answers.
- [Anthropic Messages](anthropic-messages.md): content blocks, thinking, both structured-output modes.
- [Google Gemini](google-gemini.md): `generateContent`, SSE, thought signatures. No upstream Effect provider exists.
- [Chat Completions](openai-chat-completions.md): generic dialect and xAI. Foundry rejected every xAI chat probe so far.

Citations:

- `packages/effect/...` and `packages/ai/...` are paths in [Effect-TS/effect at `82904fe`](https://github.com/Effect-TS/effect/tree/82904fe) (effect 4.1.4); line ranges refer to that commit.
- `packages/foundry-ai/...` is this repository.
- `node_modules/@ai-sdk/...` is the AI SDK provider source installed at the versions in [the model test status](../../../foundry-ai/docs/README.md).

`UNVERIFIED` marks behavior nobody has confirmed against Foundry yet; record a live fixture before relying on it. No live calls were made while writing these notes.
