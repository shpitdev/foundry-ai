# Releasing

Each package releases on its own: `@shpitdev/foundry-ai` and `@shpitdev/foundry-effect-ai` have separate Nx release groups, versions, changelogs and `<name>@<version>` tags. [release.yml](../.github/workflows/release.yml) publishes through npm trusted publishing (OIDC) with provenance, which requires the repository variable `NPM_PUBLISH_ENABLED=true` and npm trust for `shpitdev/foundry-ai` / `release.yml` on each package. [release-packages.mjs](../scripts/release-packages.mjs) decides what a merged PR publishes; packages marked `private` are never published. Release jobs install Node and pnpm from `mise.toml` and publish with Node's bundled npm, which supports trusted publishing; no step writes an npm token. [check-release-policy.mjs](../scripts/check-release-policy.mjs) checks the package names, tags and OIDC publishing in `pnpm run verify`.

## Stable release

From a clean, updated `main`, run `pnpm run verify`, then `pnpm run release <project>` (`foundry-ai` or `foundry-effect-ai`). The script checks repository and release state and opens a `release/<project>/v<version>` PR with that package's version and changelog. Review and merge it after CI passes.

The workflow builds and audits only that package, publishes it to `latest`, and pushes the annotated `<name>@<version>` tag. Verify the workflow succeeded, the npm version and `latest` tag match, and npm reports provenance before calling the release complete.

## Prerelease

Merging any other PR publishes a release candidate under npm's `next` tag for each public package whose directory it changed. Changes to `nx.json`, `package.json`, `pnpm-lock.yaml` or `packages/foundry-catalog/` count for every package. This does not advance `latest`. Package versions are immutable; a rerun succeeds only if the expected tag already points to the computed version.

## First publish of a new package

npm trusted publishing is configured on a package that already exists, so a new package's first version is published by hand:

1. On a branch, remove `private` from the package's `package.json` and set `version` to the first release. Run `pnpm run verify`.
2. From the package directory, as a `shpitdev` npm org member, run `npm publish --access public`. This sets `latest`.
3. Trust the release workflow: `npm trust github <name> --file release.yml --repo shpitdev/foundry-ai --allow-publish`.
4. Merge the branch. The merge publishes the first release candidate through OIDC, and `pnpm run release <project>` backfills the `<name>@<version>` tag because the manifest matches npm `latest`.

Use `pnpm run verify:public-metadata` to check public repository/package identity when investigating publishing problems.
