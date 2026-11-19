set shell := ["zsh", "-lc"]

clean:
  pnpm run clean

format:
  pnpm run format

build:
  pnpm run build

lint:
  pnpm run lint

test:
  pnpm run test

test-live:
  pnpm run test:live

typecheck:
  pnpm run typecheck

# Live capability workflows default to the fast canonical model set with devtools enabled.
# Use `live` for the common local loop and `live-full` for the broader catalog sweep; reports stay local.

live:
  pnpm run test:live:devtools

live-full:
  pnpm run test:live:devtools:full

# `live-model` widens to catalog scope automatically unless you pass `--canonical`.
live-model model:
  pnpm run test:live:devtools -- --model {{model}}

live-provider provider:
  pnpm run test:live:devtools -- --provider {{provider}}

# `verify` is the required preflight before opening a stable release PR.
verify:
  pnpm run verify

# `release` prepares and opens the stable release PR; publish happens after merge in CI.
release: verify
  pnpm run release
