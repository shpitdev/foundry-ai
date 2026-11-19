#!/usr/bin/env node

import { packageByProject, readDistTags, readManifest } from './packages.mjs';

const [, , project, prereleaseId = 'rc'] = process.argv;
if (!project) {
  throw new Error('Usage: node scripts/resolve-next-prerelease-version.mjs <project> [preid]');
}
const releasePackage = packageByProject(project);
const prereleaseTag = 'next';

function parseStableVersion(version) {
  const match = /^(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/.exec(version);
  if (!match?.groups) {
    throw new Error(`Expected a stable x.y.z manifest version, but received "${version}".`);
  }

  return {
    major: Number(match.groups.major),
    minor: Number(match.groups.minor),
    patch: Number(match.groups.patch),
  };
}

const stableVersion = readManifest(releasePackage).version;
const { latest: latestTag, [prereleaseTag]: nextTag } = readDistTags(releasePackage);

if (latestTag !== stableVersion) {
  throw new Error(
    `Stable manifest version ${stableVersion} is out of sync with npm latest ${latestTag}.`,
  );
}

const { major, minor, patch } = parseStableVersion(stableVersion);
const expectedPrefix = `${major}.${minor}.${patch + 1}-${prereleaseId}.`;

if (nextTag?.startsWith(expectedPrefix)) {
  const counter = nextTag.slice(expectedPrefix.length);

  if (!/^\d+$/.test(counter)) {
    throw new Error(
      `Unsupported ${prereleaseTag} tag "${nextTag}". Expected ${expectedPrefix}<number>.`,
    );
  }

  process.stdout.write(`${expectedPrefix}${Number(counter) + 1}\n`);
  process.exit(0);
}

process.stdout.write(`${expectedPrefix}0\n`);
