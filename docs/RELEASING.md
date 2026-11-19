# Releasing

Each package releases on its own: `@shpitdev/foundry-ai` and `@shpitdev/foundry-effect-ai` have separate Nx release groups, versions, changelogs and `<name>@<version>` tags. [release.yml](../.github/workflows/release.yml) publishes through npm trusted publishing (OIDC), which requires the repository variable `NPM_PUBLISH_ENABLED=true` and npm trust for `shpitdev/foundry-ai` / `release.yml` on each package. [release-packages.mjs](../scripts/release-packages.mjs) decides what a merged PR publishes; packages marked `private` are never published.

## Access

Each manifest's `publishConfig.access` decides how it publishes:

- `public` packages carry npm provenance. `@shpitdev/foundry-ai` is public.
- `restricted` packages are visible only to members of the `shpitdev` npm org, and npm cannot attach provenance to them. `@shpitdev/foundry-effect-ai` is restricted while it is in development. Release jobs read its versions with the `NPM_READ_TOKEN` secret, a read-only granular token limited to the restricted packages; release scripts run locally need `npm login` as an org member.

To make a restricted package public, audit the packed contents of every version already published, since all of them become visible. Then run `npm access set status=public <name>`, set `publishConfig.access` to `public`, and release a new version, which carries provenance. Delete `NPM_READ_TOKEN` once no package is restricted.

## Stable release

From a clean, updated `main`, run `pnpm run verify`, then `pnpm run release <project>` (`foundry-ai` or `foundry-effect-ai`). The script checks repository and release state and opens a `release/<project>/v<version>` PR with that package's version and changelog. Review and merge it after CI passes.

The workflow builds and audits only that package, publishes it to `latest`, and pushes the annotated `<name>@<version>` tag. Verify the workflow succeeded, the npm version and `latest` tag match, and, for public packages, npm reports provenance before calling the release complete.

## Prerelease

Merging any other PR publishes a release candidate under npm's `next` tag for each publishable package whose directory it changed. Changes to `nx.json`, `package.json` or `pnpm-lock.yaml` count for every package. This does not advance `latest`. Package versions are immutable; a rerun succeeds only if the expected tag already points to the computed version.

## First publish of a new package

npm trusted publishing is configured on a package that already exists, so a new package's first version is published by hand:

1. On a branch, remove `private` from the package's `package.json`, set `publishConfig.access`, and set `version` to the first release. Run `pnpm run verify`.
2. From the package directory, as a `shpitdev` npm org member, run `npm publish --access <access>`. This sets `latest`.
3. In the package's npm settings, add the trusted publisher: GitHub Actions, organization `shpitdev`, repository `foundry-ai`, workflow `release.yml`, no environment. For a restricted package, also give `NPM_READ_TOKEN` read access to it, or create the token:

   ```sh
   npm token create --name foundry-ai-release-read --packages-and-scopes-permission read-only \
     --packages @shpitdev/foundry-effect-ai --json \
     | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0, "utf8")).token)' \
     | gh secret set NPM_READ_TOKEN --repo shpitdev/foundry-ai
   ```

4. Merge the branch. The merge publishes the first release candidate through OIDC, and `pnpm run release <project>` backfills the `<name>@<version>` tag because the manifest matches npm `latest`.

Use `pnpm run verify:public-metadata` to check public repository/package identity when investigating publishing problems.
