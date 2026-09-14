# Releasing

Releases publish `@nyrra/foundry-ai` through [release.yml](../.github/workflows/release.yml), using npm trusted publishing and provenance. Publishing requires the repository variable `NPM_PUBLISH_ENABLED=true` and npm trust for `shpitdev/foundry-ai` / `release.yml`.

## Stable release

From a clean, updated `main`, run `pnpm run verify`, then `pnpm run release`. The release script checks repository and release state and prepares a `release/*` PR with the package version and changelog. Review and merge that PR after CI passes.

The release workflow builds and audits the package, publishes the stable version to `latest`, and pushes the annotated `@nyrra/foundry-ai@{version}` tag. Verify the workflow succeeded, the npm version and `latest` tag match, and npm reports provenance before calling the release complete.

## Prerelease

Merging a non-release PR publishes the next release candidate under npm's `next` tag. This does not advance `latest`. Package versions are immutable; a rerun succeeds only if the expected tag already points to the computed version.

Use `pnpm run verify:public-metadata` to check public repository/package identity when investigating publishing problems.
