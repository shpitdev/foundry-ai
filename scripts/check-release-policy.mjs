#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { isPublishable, packages, readManifest } from './packages.mjs';

const workflowSource = readFileSync('.github/workflows/release.yml', 'utf8');
const workflow = parse(workflowSource);
const nxRelease = JSON.parse(readFileSync('nx.json', 'utf8')).release;
const expectedRepository = 'git+https://github.com/shpitdev/foundry-ai.git';

function requireCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
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
// Publishing is OIDC-only: no secret, token, .npmrc writer or second toolchain may appear.
for (const [text, message] of [
  ['secrets.', 'Release jobs publish through OIDC and must not use secrets.'],
  ['NODE_AUTH_TOKEN', 'Release jobs must not set NODE_AUTH_TOKEN; npm publishes through OIDC.'],
  ['NPM_TOKEN', 'Release jobs must not use an npm token; npm publishes through OIDC.'],
  ['registry-url', 'Release jobs must not write an .npmrc registry token.'],
  ['actions/setup-node', 'Release jobs install Node from mise.toml, not actions/setup-node.'],
  ['pnpm/action-setup', 'Release jobs install pnpm from mise.toml, not pnpm/action-setup.'],
  ['npm install --global', "Release jobs publish with Node's bundled npm from mise.toml."],
  [
    'MISE_',
    'Release jobs must not override mise settings or tool versions through MISE_* variables.',
  ],
]) {
  requireCondition(!workflowSource.includes(text), message);
}

// mise.toml is the release toolchain; package.json's packageManager must name the same pnpm.
const miseToml = readFileSync('mise.toml', 'utf8');
const misePnpm = /^pnpm\s*=\s*"([^"]+)"$/mu.exec(miseToml)?.[1];
const miseNode = /^node\s*=\s*"(\d+)[^"]*"$/mu.exec(miseToml)?.[1];
const packageManager = JSON.parse(readFileSync('package.json', 'utf8')).packageManager;
requireCondition(
  misePnpm != null && packageManager === `pnpm@${misePnpm}`,
  `package.json packageManager (${packageManager}) must match mise.toml pnpm (${misePnpm}).`,
);
// npm supports trusted publishing from 11.5.1; Node 26 bundles a release after that.
requireCondition(
  Number(miseNode) >= 26,
  `mise.toml must pin Node 26 or later for OIDC publishing with the bundled npm; found ${miseNode}.`,
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
  requireCondition(
    !isPublishable(entry) || manifest.publishConfig?.access === 'public',
    `${entry.name} must publish with public access, which provenance requires.`,
  );
}

// Gates are compared whole: a substring check would accept an inverted clause.
const normalize = (expression) => expression?.replaceAll(/\s+/gu, ' ').trim();
const published = "vars.NPM_PUBLISH_ENABLED == 'true' && github.event.pull_request.merged == true";
const releaseBranch = "startsWith(github.event.pull_request.head.ref, 'release/')";
const selected = "needs.select-packages.outputs.packages != '[]'";
const mergeCommit = '${{ github.event.pull_request.merge_commit_sha }}';
const miseAction = 'jdx/mise-action@v5';
const isMise = (step) => step.uses?.startsWith('jdx/mise-action') === true;
// Every mise step installs exactly the mise.toml pins, without the shared tool cache: any other
// input (install: false, mise_toml, version, install_args) or step env could change the toolchain.
for (const [name, job] of Object.entries(workflow.jobs ?? {})) {
  for (const step of (job.steps ?? []).filter((candidate) => isMise(candidate))) {
    requireCondition(
      step.uses === miseAction &&
        JSON.stringify(step.with) === '{"cache":false}' &&
        step.env == null &&
        step.if == null,
      `${name} must run ${miseAction} with exactly { cache: false } and no env or condition.`,
    );
  }
}

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
requireCondition(
  select.steps?.some((step) => isMise(step)),
  `select-packages must install Node with ${miseAction}.`,
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
  const steps = job.steps ?? [];
  const miseStep = steps.findIndex((step) => isMise(step));
  const publishSteps = steps.flatMap((step, index) =>
    step.run?.includes('npm publish') ? [index] : [],
  );
  requireCondition(
    miseStep >= 0,
    `${name} must install Node and pnpm from mise.toml with ${miseAction}.`,
  );
  requireCondition(
    publishSteps.length === 1 && publishSteps[0] > miseStep,
    `${name} must publish exactly once, after installing tools from mise.toml.`,
  );
  const publish = steps[publishSteps[0]];
  // Compared line by line: joining both commands on one line would make npm an argument to cd.
  const publishLines = publish.run
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  requireCondition(
    JSON.stringify(publishLines) ===
      JSON.stringify([
        'cd "${PACKAGE_DIR}"',
        `npm publish --access public --tag ${channel} --provenance`,
      ]) && Object.keys(publish.env ?? {}).join() === 'PACKAGE_DIR',
    `${name} must run only "npm publish --access public --tag ${channel} --provenance" through OIDC.`,
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
