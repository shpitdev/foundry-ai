## 0.1.0 (2026-11-22)

### 🚀 Features

- add Z.ai GLM providers for AI SDK and Effect ([#109](https://github.com/shpitdev/foundry-ai/pull/109))
- **effect-ai:** add DeepSeek, NVIDIA, Qwen, Moonshot and Gemma language modules ([#108](https://github.com/shpitdev/foundry-ai/pull/108))
- ⚠️  add open-weight AI SDK providers ([#107](https://github.com/shpitdev/foundry-ai/pull/107))
- **realtime:** support inline input transcription ([#105](https://github.com/shpitdev/foundry-ai/pull/105))
- **effect-ai:** OpenAiRealtime sessions over Foundry's realtime WebSocket (phase 9) ([#104](https://github.com/shpitdev/foundry-ai/pull/104))
- **catalog:** add GPT-6.2 and Gemini 4 Neon, retire Grok Build 0.1 ([#103](https://github.com/shpitdev/foundry-ai/pull/103))
- **effect-ai:** integration, catalog sweep and release readiness (phase 8) ([#99](https://github.com/shpitdev/foundry-ai/pull/99))
- **effect-ai:** GoogleLanguageModel over /google/v1 generateContent (phase 5) ([#97](https://github.com/shpitdev/foundry-ai/pull/97))
- **effect-ai:** AnthropicLanguageModel over /anthropic/v1/messages (phase 4) ([#96](https://github.com/shpitdev/foundry-ai/pull/96))
- **effect-ai:** XaiLanguageModel over /xai/v1/responses (phase 3) ([#98](https://github.com/shpitdev/foundry-ai/pull/98))
- **effect-ai:** OpenAiChatLanguageModel over /openai/v1/chat/completions (phase 7) ([#95](https://github.com/shpitdev/foundry-ai/pull/95))
- **effect-ai:** OpenAiLanguageModel over Responses and FoundryClient.sse (phase 2) ([#94](https://github.com/shpitdev/foundry-ai/pull/94))
- **effect-ai:** OpenAiEmbeddingModel over /openai/v1/embeddings (phase 6) ([#93](https://github.com/shpitdev/foundry-ai/pull/93))
- **effect-ai:** FoundryClient, Foundry error mapping and OpenAiDecisionModel (phase 1) ([#92](https://github.com/shpitdev/foundry-ai/pull/92))

### 🩹 Fixes

- **release:** drop tag backfill; tag a hand-published first version once ([#102](https://github.com/shpitdev/foundry-ai/pull/102))
- **release:** backfill missing version tags on the commit that set the version ([#101](https://github.com/shpitdev/foundry-ai/pull/101))

### ⚠️  Breaking Changes

- add open-weight AI SDK providers  ([#107](https://github.com/shpitdev/foundry-ai/pull/107))

### ❤️ Thank You

- Anand Pant @anandpant

## 0.0.10 (2026-11-19)

### ⚠️ Breaking Changes

- the package moved from `@nyrra/foundry-ai` to `@shpitdev/foundry-ai`. Replace the name in dependencies and imports; the API is unchanged. `@nyrra/foundry-ai` is deprecated and keeps versions up to 0.0.9.

## 0.0.9 (2026-11-19)

### 🚀 Features

- refresh Foundry catalog, AI SDK peers, and live results ([#82](https://github.com/shpitdev/foundry-ai/pull/82))
- add GPT-6 Luna decision models ([#81](https://github.com/shpitdev/foundry-ai/pull/81))

### 🔥 Removed

- the `./third-party` subpath, `createFoundryThirdParty`, and the `THIRD_PARTY_*` exports ([#83](https://github.com/shpitdev/foundry-ai/pull/83))
- the published agent skill; examples now live in the repository's `examples/` directory ([#83](https://github.com/shpitdev/foundry-ai/pull/83))
- 16 catalog aliases that Foundry no longer lists or serves, including o3, o4-mini, gpt-4o, gpt-realtime-2, and the Kimi, GLM, Qwen, and DeepSeek models ([#82](https://github.com/shpitdev/foundry-ai/pull/82))

### ❤️ Thank You

- Anand Pant @anandpant

## 0.0.8 (2026-09-25)

### 🚀 Features

- refresh Foundry model catalog ([#77](https://github.com/shpitdev/foundry-ai/pull/77))
- add native Foundry xAI provider ([#74](https://github.com/shpitdev/foundry-ai/pull/74))
- add verified SDK 7 realtime models ([#70](https://github.com/shpitdev/foundry-ai/pull/70))

### 🩹 Fixes

- keep native structured output for Claude Opus 5.5 ([#78](https://github.com/shpitdev/foundry-ai/pull/78))
- distinguish structured output failures from model support ([#71](https://github.com/shpitdev/foundry-ai/pull/71))
- retire deprecated models and publish current SDK 7 support ([#68](https://github.com/shpitdev/foundry-ai/pull/68))

### ❤️ Thank You

- anandpant @anandpant

## 0.0.7 (2026-09-13)

### 🚀 Features

- add Gemini and third-party model routes ([#63](https://github.com/shpitdev/foundry-ai/pull/63))

### ❤️ Thank You

- anandpant @anandpant

## 0.0.6 (2026-08-07)

### 🚀 Features

- refresh models and support AI SDK 7 ([#55](https://github.com/shpitdev/foundry-ai/pull/55))

### ❤️ Thank You

- anandpant @anandpant

## 0.0.5 (2026-07-11)

### 📦 Repository Transfer

- continue publishing the existing `@nyrra/foundry-ai` package from `shpitdev/foundry-ai`
- preserve the package name, root exports, provider subpaths, configuration, and model behavior
- publish through GitHub Actions with npm trusted publishing and provenance

### 🚀 Features

- add live-confirmed support for GPT-5.5, GPT-5 Pro, GPT-5.3 Codex, Claude Opus 4.7/4.8, and Gemini 3.5 Flash
- expand the live capability harness and provider documentation

### 🛠️ Maintenance

- refresh supported AI SDK dependencies and GitHub Actions
- configure merge-queue-aware CI and Graphite CI optimization

## 0.0.4 (2026-03-30)

### 🩹 Fixes

- update lockfile for peer dep range changes ([62c26ff](https://github.com/shpitdev/foundry-ai/commit/62c26ff))
- sync foundry-ai peer dependency ranges with latest sdk versions ([b069db5](https://github.com/shpitdev/foundry-ai/commit/b069db5))

### ❤️ Thank You

- anandpant

## 0.0.3 (2026-03-30)

### 🚀 Features

- enrich exa devtools examples with extra tools and mid-tier models ([9284006](https://github.com/shpitdev/foundry-ai/commit/9284006))

### 🩹 Fixes

- remove throw from onError in tool-calling-streaming example ([f472d4a](https://github.com/shpitdev/foundry-ai/commit/f472d4a))
- remove throw from onError callbacks to avoid unhandled rejections ([476a1ac](https://github.com/shpitdev/foundry-ai/commit/476a1ac))
- update package-audit for split example modules ([2d457e0](https://github.com/shpitdev/foundry-ai/commit/2d457e0))

### ❤️ Thank You

- anandpant

## 0.0.2 (2026-03-28)

### 🚀 Features

- implement phase 1 foundry ai package ([abad30a](https://github.com/shpitdev/foundry-ai/commit/abad30a))

### ❤️ Thank You

- anandpant
