#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { packages, readManifest } from './packages.mjs';

const workflowSource = readFileSync('.github/workflows/release.yml', 'utf8');
const workflow = parse(workflowSource);
const nxRelease = JSON.parse(readFileSync('nx.json', 'utf8')).release;
const expectedRepository = 'git+https://github.com/shpitdev/foundry-ai.git';

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

requireCondition(workflow.permissions?.contents === 'write', 'Release workflow needs tag access.');
requireCondition(
  workflow.permissions?.['id-token'] === 'write',
  'Release workflow needs npm provenance identity tokens.',
);
requireCondition(
  workflow.jobs?.['bootstrap-package'] == null,
  'The retired new-package bootstrap job must not exist.',
);
requireCondition(
  !workflowSource.includes('NPM_BOOTSTRAP_TOKEN'),
  'The retired bootstrap token must not be referenced.',
);

for (const entry of packages) {
  const manifest = readManifest(entry);
  requireCondition(manifest.name === entry.name, `${entry.dir} must remain ${entry.name}.`);
  requireCondition(
    manifest.repository?.url === expectedRepository,
    `${entry.name} repository must be ${expectedRepository}.`,
  );
  const group = nxRelease?.groups?.[entry.project];
  requireCondition(
    group?.projects?.length === 1 && group.projects[0] === entry.project,
    `nx.json needs a release group "${entry.project}" containing only that project.`,
  );
  requireCondition(
    group.releaseTag?.pattern === `${entry.name}@{version}`,
    `Release group ${entry.project} must tag ${entry.name}@{version}.`,
  );
}

// Gates are compared whole: a substring check would accept an inverted clause.
const normalize = (expression) => expression?.replace(/\s+/g, ' ').trim();
const published = "vars.NPM_PUBLISH_ENABLED == 'true' && github.event.pull_request.merged == true";
const releaseBranch = "startsWith(github.event.pull_request.head.ref, 'release/')";
const selected = "needs.select-packages.outputs.packages != '[]'";
const mergeCommit = '${{ github.event.pull_request.merge_commit_sha }}';

const select = workflow.jobs?.['select-packages'];
requireCondition(select != null, 'Missing release job select-packages.');
requireCondition(
  normalize(select.if) === published,
  'select-packages must run only for merged PRs with NPM_PUBLISH_ENABLED=true.',
);
requireCondition(
  select.steps?.some((step) => step.with?.ref === mergeCommit),
  'select-packages must read manifests at the merge commit.',
);
requireCondition(
  select.steps?.some(
    (step) =>
      step.run?.includes('/pulls/${PR_NUMBER}/files') &&
      step.run?.includes('node scripts/release-packages.mjs'),
  ),
  "select-packages must choose packages from the PR's changed files with scripts/release-packages.mjs.",
);

for (const [name, channel, branchGate] of [
  ['publish-prerelease', 'next', `!${releaseBranch}`],
  ['publish-stable', 'latest', releaseBranch],
]) {
  const job = workflow.jobs?.[name];
  requireCondition(job != null, `Missing release job ${name}.`);
  requireCondition(
    normalize(job.if) === `${published} && ${branchGate} && ${selected}`,
    `${name} has the wrong gate; expected: ${published} && ${branchGate} && ${selected}`,
  );
  requireCondition(
    job.needs === 'select-packages' &&
      job.strategy?.matrix?.package === '${{ fromJSON(needs.select-packages.outputs.packages) }}',
    `${name} must publish one matrix entry per selected package.`,
  );
  requireCondition(
    job.concurrency?.group === `release-\${{ matrix.package.project }}-${channel}` &&
      job.concurrency?.['cancel-in-progress'] === false,
    `${name} must queue per package and channel without cancelling.`,
  );
  requireCondition(
    job.steps?.[0]?.with?.ref === mergeCommit,
    `${name} must build and tag the merge commit.`,
  );
  requireCondition(job['runs-on'] === 'ubuntu-latest', `${name} must use a GitHub-hosted runner.`);
  requireCondition(
    job.steps?.some((step) => step.run === 'npm install --global npm@11.16.0'),
    `${name} must pin a trusted-publishing-compatible npm version.`,
  );
  requireCondition(
    job.steps?.some((step) =>
      step.run?.includes(
        `NODE_AUTH_TOKEN="" npm publish --access public --tag ${channel} --provenance`,
      ),
    ),
    `${name} must publish to ${channel} through OIDC rather than an npm token.`,
  );
}

for (const job of Object.values(workflow.jobs ?? {})) {
  for (const step of job.steps ?? []) {
    if (step.run) {
      execFileSync('bash', ['-n'], { input: step.run, stdio: ['pipe', 'ignore', 'pipe'] });
    }
  }
}

console.log(
  `Release policy check passed for ${packages.map((entry) => entry.name).join(', ')} from shpitdev/foundry-ai.`,
);
