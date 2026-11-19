#!/usr/bin/env node
// Checks the few release invariants that would publish the wrong thing if they drifted.
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { isPublishable, packages, readManifest } from './packages.mjs';

const workflowSource = readFileSync('.github/workflows/release.yml', 'utf8');
const workflow = parse(workflowSource);
const nxGroups = JSON.parse(readFileSync('nx.json', 'utf8')).release?.groups ?? {};
const packageManager = JSON.parse(readFileSync('package.json', 'utf8')).packageManager;
const misePnpm = /^pnpm\s*=\s*"([^"]+)"$/mu.exec(readFileSync('mise.toml', 'utf8'))?.[1];
const failures = [];
const check = (condition, message) => condition || failures.push(message);

check(packageManager === `pnpm@${misePnpm}`, 'package.json packageManager must match mise.toml.');

for (const entry of packages) {
  const manifest = readManifest(entry);
  const group = nxGroups[entry.project];
  check(manifest.name === entry.name, `${entry.dir} must be ${entry.name}.`);
  check(
    manifest.repository?.url === 'git+https://github.com/shpitdev/foundry-ai.git',
    `${entry.name} must point at shpitdev/foundry-ai; npm trusted publishing checks it.`,
  );
  check(
    group?.projects?.join() === entry.project &&
      group.releaseTag?.pattern === `${entry.name}@{version}`,
    `nx.json needs a release group ${entry.project} tagging ${entry.name}@{version}.`,
  );
  check(
    !isPublishable(entry) || manifest.publishConfig?.access === 'public',
    `${entry.name} must publish publicly; provenance requires it.`,
  );
}

check(workflow.permissions?.['id-token'] === 'write', 'release.yml needs id-token: write.');
check(!workflowSource.includes('secrets.'), 'release.yml publishes through OIDC, without secrets.');
for (const name of ['publish-prerelease', 'publish-stable']) {
  const steps = workflow.jobs?.[name]?.steps ?? [];
  check(
    steps[0]?.with?.ref === '${{ github.event.pull_request.merge_commit_sha }}',
    `${name} must check out the merge commit.`,
  );
  check(
    steps.some((step) => /^\s*npm publish .*--provenance$/mu.test(step.run ?? '')),
    `${name} must run npm publish with --provenance.`,
  );
}

if (failures.length > 0) {
  console.error(failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log(`Release policy check passed for ${packages.map((entry) => entry.name).join(', ')}.`);
