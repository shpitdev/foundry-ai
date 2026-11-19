# Releasing

Each package releases on its own: `@nyrra/foundry-ai` and `@nyrra/foundry-effect-ai` have separate Nx release groups, versions, changelogs and `<name>@<version>` tags. [release.yml](../.github/workflows/release.yml) publishes through npm trusted publishing with provenance, which requires the repository variable `NPM_PUBLISH_ENABLED=true` and npm trust for `shpitdev/foundry-ai` / `release.yml` on each package. [release-packages.mjs](../scripts/release-packages.mjs) decides what a merged PR publishes; packages marked `private` are never published.

## Stable release

From a clean, updated `main`, run `pnpm run verify`, then `pnpm run release <project>` (`foundry-ai` or `foundry-effect-ai`). The script checks repository and release state and opens a `release/<project>/v<version>` PR with that package's version and changelog. Review and merge it after CI passes.

The workflow builds and audits only that package, publishes it to `latest`, and pushes the annotated `<name>@<version>` tag. Verify the workflow succeeded, the npm version and `latest` tag match, and npm reports provenance before calling the release complete.

## Prerelease

Merging any other PR publishes a release candidate under npm's `next` tag for each public package whose directory it changed. Changes to `nx.json`, `package.json` or `pnpm-lock.yaml` count for every package. This does not advance `latest`. Package versions are immutable; a rerun succeeds only if the expected tag already points to the computed version.

## First publish of a new package

npm trusted publishing is configured on a package that already exists, so a new package's first version is published by hand:

1. On a branch, remove `private` from the package's `package.json` and set `version` to the first release, for example `0.1.0`. Run `pnpm run verify`.
2. From the package directory, run `npm publish --access public` with an npm account that owns the `@nyrra` scope. This sets `latest`.
3. In the package's npm settings, add the trusted publisher `shpitdev/foundry-ai` / `release.yml`.
4. Merge the branch. Its manifest now matches npm `latest`, so `pnpm run release <project>` can backfill the `<name>@<version>` tag, and the merge publishes the first release candidate through OIDC.

Use `pnpm run verify:public-metadata` to check public repository/package identity when investigating publishing problems.
