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

# `verify` is the required preflight before opening a stable release PR.
verify:
  pnpm run verify

# `release` prepares and opens the stable release PR; publish happens after merge in CI.
release: verify
  pnpm run release
