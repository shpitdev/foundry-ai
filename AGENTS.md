# foundry-ai Agent Guide

## Required Workflow

- Work from the latest `main`.
- Use short-lived branches
- Commit frequently (one line, no novels), but keep PRs meaningful.
- Until the remote exists, keep history clean and commit only verified changes.
- Keep temp files in `.memory/` which is gitignored

## Tooling Rules

- Use Nx generators first for new apps/packages. Manual edits only after generation. For repeated scripts, prefer Nx solutions (generators/plugins).
- Use `pnpm exec nx <target> <project>` or `pnpm run <script>` from repo root. Don't introduce multiple ways to run the same thing.
- Biome is the only linter/formatter. Do not add ESLint, Prettier
- Vitest is the only test runner. Use `.test` files, not `.spec` files.
- Keep route files app-local. Shared packages must stay router-agnostic.

## Reliability Rules
- Verify locally before committing. Don't rely on unstaged fixes.

## See Also

- `README.md` — Development workflow; `packages/foundry-ai/docs/README.md` — Model routing and test status
