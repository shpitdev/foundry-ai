#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { isPublishable, packageByProject, readDistTags, readManifest } from './packages.mjs';

const project = process.argv[2];
if (!project) {
  throw new Error('Usage: pnpm run release <project>, e.g. pnpm run release foundry-ai');
}
const releasePackage = packageByProject(project);
if (!isPublishable(releasePackage)) {
  throw new Error(`${releasePackage.name} is private; remove "private" before its first release.`);
}
const packageName = releasePackage.name;
const packageManifestPath = `${releasePackage.dir}/package.json`;
const remoteName = 'origin';
const baseBranch = 'main';
const expectedRemoteUrls = new Set([
  'git@github.com:shpitdev/foundry-ai.git',
  'https://github.com/shpitdev/foundry-ai.git',
]);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  }).trim();
}

function runStreaming(command, args, options = {}) {
  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    ...options,
  });
}

function runQuiet(command, args, options = {}) {
  try {
    execFileSync(command, args, {
      cwd: process.cwd(),
      stdio: 'ignore',
      ...options,
    });
    return true;
  } catch {
    return false;
  }
}

function readManifestVersion() {
  return readManifest(releasePackage).version;
}

function localBranchExists(branchName) {
  return runQuiet('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);
}

function remoteBranchExists(branchName) {
  return run('git', ['ls-remote', '--heads', remoteName, `refs/heads/${branchName}`]).length > 0;
}

function remoteTagExists(tagName) {
  return run('git', ['ls-remote', '--tags', remoteName, `refs/tags/${tagName}`]).length > 0;
}

function localTagExists(tagName) {
  return run('git', ['tag', '--list', tagName]).length > 0;
}

function ensureCleanWorktree() {
  const status = run('git', ['status', '--porcelain']);
  if (status.length > 0) {
    throw new Error(
      'Working tree is not clean. Commit, stash, or discard changes before creating a release PR.',
    );
  }
}

function ensureReleaseRemote() {
  const remoteUrl = run('git', ['remote', 'get-url', remoteName]);
  if (!expectedRemoteUrls.has(remoteUrl)) {
    throw new Error(
      `Release remote must be the public destination. Expected one of ${[...expectedRemoteUrls].join(', ')}, received ${remoteUrl}.`,
    );
  }
}

function ensureStableTagOnMain() {
  const currentVersion = readManifestVersion();
  const tagName = `${packageName}@${currentVersion}`;

  if (remoteTagExists(tagName)) {
    return;
  }

  if (localTagExists(tagName)) {
    runStreaming('git', ['push', remoteName, tagName]);
    return;
  }

  const latestTag = readDistTags(releasePackage).latest;
  if (latestTag !== currentVersion) {
    throw new Error(
      `Refusing to backfill ${tagName}: package manifest is ${currentVersion}, but npm latest is ${latestTag ?? '<unset>'}.`,
    );
  }

  runStreaming('git', ['tag', '-a', tagName, '-m', `Release ${tagName}`]);
  runStreaming('git', ['push', remoteName, tagName]);
}

function resolveNextVersion(firstRelease) {
  const output = run('pnpm', [
    'exec',
    'nx',
    'release',
    'version',
    '--group',
    project,
    '--git-commit=false',
    '--git-tag=false',
    '--git-push=false',
    '--stage-changes=false',
    '--dry-run',
    ...(firstRelease ? ['--first-release'] : []),
  ]);

  const match =
    output.match(/New version ([0-9A-Za-z.+-]+) written to manifest/) ??
    output.match(/to get new version ([0-9A-Za-z.+-]+)/);

  if (!match) {
    throw new Error(`Unable to determine the next release version from nx output:\n${output}`);
  }

  return match[1];
}

function createPrBody(version) {
  return `## Release \`${packageName}@${version}\`

Merging this PR will:
- publish \`${packageName}@${version}\` to npm with \`dist-tag=latest\`
- push the git tag \`${packageName}@${version}\`

### Changelog
See the CHANGELOG diff in this PR for the full release notes.`;
}

ensureCleanWorktree();
ensureReleaseRemote();
runStreaming('git', ['fetch', remoteName, baseBranch, '--tags']);
runStreaming('git', ['switch', baseBranch]);
runStreaming('git', ['pull', '--ff-only', remoteName, baseBranch]);
ensureStableTagOnMain();

const firstRelease = run('git', ['tag', '--list', `${packageName}@*`]).length === 0;
const nextVersion = resolveNextVersion(firstRelease);
const branchName = `release/${project}/v${nextVersion}`;

if (localBranchExists(branchName) || remoteBranchExists(branchName)) {
  throw new Error(`Release branch ${branchName} already exists.`);
}

runStreaming('git', ['switch', '--create', branchName]);

const versionArgs = [
  'exec',
  'nx',
  'release',
  'version',
  '--group',
  project,
  '--git-commit=false',
  '--git-tag=false',
  '--git-push=false',
  '--stage-changes=false',
];
const changelogArgs = [
  'exec',
  'nx',
  'release',
  'changelog',
  '--group',
  project,
  '--git-commit=false',
  '--git-tag=false',
  '--git-push=false',
  '--stage-changes=false',
];

if (firstRelease) {
  versionArgs.push('--first-release');
  changelogArgs.push('--first-release');
}

runStreaming('pnpm', versionArgs);
runStreaming('pnpm', [...changelogArgs, nextVersion]);

const changedFiles = run('git', ['status', '--porcelain']);
if (changedFiles.length === 0) {
  throw new Error('Release generation did not produce any file changes.');
}

runStreaming('git', ['add', packageManifestPath, `${releasePackage.dir}/CHANGELOG.md`]);
runStreaming('git', ['commit', '-m', `chore(release): ${packageName}@${nextVersion}`]);
runStreaming('git', ['push', '-u', remoteName, branchName]);
runStreaming('gh', [
  'pr',
  'create',
  '--base',
  baseBranch,
  '--head',
  branchName,
  '--title',
  `chore(release): ${packageName}@${nextVersion}`,
  '--body',
  createPrBody(nextVersion),
]);
