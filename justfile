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

test-live-effect:
  pnpm run test:live:effect

typecheck:
  pnpm run typecheck

# `verify` is the required preflight before opening a stable release PR.
verify:
  pnpm run verify

# `release` prepares and opens one package's stable release PR; publish happens after merge in CI.
release project: verify
  pnpm run release {{project}}
