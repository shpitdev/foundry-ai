#!/usr/bin/env node

import { packageByProject, readDistTags, readManifest } from './packages.mjs';

const [, , project, prereleaseId = 'rc'] = process.argv;
if (!project) {
  throw new Error('Usage: node scripts/resolve-next-prerelease-version.mjs <project> [preid]');
}
const releasePackage = packageByProject(project);
const prereleaseTag = 'next';

function parseStableVersion(version) {
  const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u.exec(version);
  if (!match?.groups) {
    throw new Error(`Expected a stable x.y.z version, but received "${version}".`);
  }

  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
  };
}

const stableVersion = readManifest(releasePackage).version;
const { latest: latestTag, [prereleaseTag]: nextTag } = readDistTags(releasePackage);

const { major, minor, patch } = parseStableVersion(stableVersion);
// A manifest ahead of npm latest means a stable release merged and its publish job has not
// finished; release candidates build on the new version. One behind it is out of sync.
const latest = parseStableVersion(latestTag);
const firstDifference =
  [major - latest.major, minor - latest.minor, patch - latest.patch].find((d) => d !== 0) ?? 0;
if (firstDifference < 0) {
  throw new Error(`Stable manifest version ${stableVersion} is behind npm latest ${latestTag}.`);
}

const expectedPrefix = `${major}.${minor}.${patch + 1}-${prereleaseId}.`;

if (nextTag?.startsWith(expectedPrefix)) {
  const counter = nextTag.slice(expectedPrefix.length);

  if (!/^\d+$/u.test(counter)) {
    throw new Error(
      `Unsupported ${prereleaseTag} tag "${nextTag}". Expected ${expectedPrefix}<number>.`,
    );
  }

  process.stdout.write(`${expectedPrefix}${Number(counter) + 1}\n`);
  process.exit(0);
}

process.stdout.write(`${expectedPrefix}0\n`);
