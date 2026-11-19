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
- Biome formats the whole repo and lints everything except `packages/foundry-effect-ai`, which oxlint (`.oxlintrc.json`) and Effect language-service diagnostics lint. Do not add ESLint or Prettier.
- Vitest is the only test runner. Use `.test` files, not `.spec` files.
- Keep route files app-local. Shared packages must stay router-agnostic.
- `@shpitdev/foundry-ai` (AI SDK) and `@shpitdev/foundry-effect-ai` (Effect) never import each other; lint enforces it. The Effect package depends only on `effect`; follow `packages/foundry-effect-ai/docs/PLAN.md`.
- Each package releases independently: `pnpm run release <project>`. See `docs/RELEASING.md`.

## Reliability Rules
- Verify locally before committing. Don't rely on unstaged fixes.

## See Also

- `README.md` — Development workflow; `packages/foundry-ai/docs/README.md` — Model routing and test status; `packages/foundry-effect-ai/docs/PLAN.md` — Effect adapter plan and guardrails
