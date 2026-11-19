#!/usr/bin/env node
// Selects what a merged PR publishes, as GitHub Actions outputs:
//   channel=next|latest
//   packages=[{"project","dir","name"}, ...]
// A release/<project>/v<version> branch publishes that project to latest. Any other PR publishes
// a release candidate to next for each publishable package whose files, or the shared release
// inputs, it changed.
import { execFileSync } from 'node:child_process';
import { isPublishable, packageByProject, packages } from './packages.mjs';

const sharedInputs = ['nx.json', 'package.json', 'pnpm-lock.yaml'];

const [, , mergeSha, headRef] = process.argv;
if (!mergeSha || !headRef) {
  throw new Error('Usage: node scripts/release-packages.mjs <merge-commit-sha> <head-ref>');
}

let channel;
let selected;
if (headRef.startsWith('release/')) {
  const match = /^release\/(?<project>[a-z0-9-]+)\/v\d+\.\d+\.\d+$/.exec(headRef);
  if (!match?.groups) {
    throw new Error(`Release branch ${headRef} must be release/<project>/v<x.y.z>.`);
  }
  channel = 'latest';
  selected = [packageByProject(match.groups.project)];
} else {
  // The merge or squash commit's first parent is main before this PR.
  const changed = execFileSync('git', ['diff', '--name-only', `${mergeSha}^1`, mergeSha], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
  const touchesShared = changed.some((file) => sharedInputs.includes(file));
  channel = 'next';
  selected = packages.filter(
    (entry) => touchesShared || changed.some((file) => file.startsWith(`${entry.dir}/`)),
  );
}

const publishable = selected.filter(isPublishable);
for (const entry of selected) {
  if (!publishable.includes(entry)) {
    console.error(`Skipping ${entry.name}: private.`);
  }
}
console.log(`channel=${channel}`);
console.log(`packages=${JSON.stringify(publishable)}`);
