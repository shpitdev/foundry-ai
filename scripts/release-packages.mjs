#!/usr/bin/env node
// Selects what a merged PR publishes and prints it as a GitHub Actions output:
//   packages=[{"project","dir","name","version"}, ...]
// Run from a checkout of the merge commit, with the PR's changed files (one path per line,
// including the previous path of renames) on stdin.
//
// A release/<project>/v<x.y.z> branch publishes that project to latest, and only when the merged
// manifest carries exactly that version. Any other PR publishes a release candidate to next for
// each public package whose files, or the shared release inputs, it changed.
import { readFileSync } from 'node:fs';
import { isPublishable, packageByProject, packages, readManifest } from './packages.mjs';

const sharedInputs = ['nx.json', 'package.json', 'pnpm-lock.yaml'];

const headRef = process.argv[2];
if (!headRef) {
  throw new Error('Usage: node scripts/release-packages.mjs <head-ref> < changed-files');
}

let selected;
if (headRef.startsWith('release/')) {
  const match = /^release\/(?<project>[a-z0-9-]+)\/v(?<version>\d+\.\d+\.\d+)$/.exec(headRef);
  if (!match?.groups) {
    throw new Error(`Release branch ${headRef} must be release/<project>/v<x.y.z>.`);
  }
  const entry = packageByProject(match.groups.project);
  const manifestVersion = readManifest(entry).version;
  if (manifestVersion !== match.groups.version) {
    throw new Error(
      `${headRef} releases ${match.groups.version}, but ${entry.dir}/package.json is ${manifestVersion}.`,
    );
  }
  if (!isPublishable(entry)) {
    throw new Error(`${headRef} targets ${entry.name}, which is private.`);
  }
  selected = [entry];
} else {
  const changed = readFileSync(0, 'utf8').split('\n').filter(Boolean);
  if (changed.length === 0) {
    throw new Error('No changed files on stdin; cannot tell which packages this PR touched.');
  }
  const touchesShared = changed.some((file) => sharedInputs.includes(file));
  selected = packages.filter(
    (entry) =>
      (touchesShared || changed.some((file) => file.startsWith(`${entry.dir}/`))) &&
      isPublishable(entry),
  );
}

const output = selected.map((entry) => ({ ...entry, version: readManifest(entry).version }));
console.log(`packages=${JSON.stringify(output)}`);
