#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const repository = 'shpitdev/foundry-ai';
const expectedDescription =
  'Thin Palantir Foundry provider adapters and model catalog for the Vercel AI SDK.';
const expectedHomepage = 'https://www.npmjs.com/package/@shpitdev/foundry-ai';
const expectedTopics = [
  'ai',
  'ai-sdk',
  'ai-sdk-provider',
  'foundry',
  'foundry-ai',
  'llm',
  'nx',
  'palantir',
  'palantir-foundry',
  'shpit',
  'typescript',
  'vercel-ai-sdk',
].sort();

function readGitHubJson(path) {
  return JSON.parse(
    execFileSync('gh', ['api', path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
    }),
  );
}

let metadata;
let topics;
try {
  metadata = readGitHubJson(`repos/${repository}`);
  topics = readGitHubJson(`repos/${repository}/topics`).names.toSorted();
} catch {
  console.error(`Unable to read public repository metadata for ${repository}.`);
  process.exit(1);
}
const mismatches = [];

if (metadata.full_name !== repository) {
  mismatches.push(`repository: expected ${repository}, received ${metadata.full_name}`);
}
if (metadata.visibility !== 'public') {
  mismatches.push(`visibility: expected public, received ${metadata.visibility}`);
}
if (metadata.default_branch !== 'main') {
  mismatches.push(`default branch: expected main, received ${metadata.default_branch}`);
}
if (metadata.description !== expectedDescription) {
  mismatches.push(`description: expected ${expectedDescription}, received ${metadata.description}`);
}
if (metadata.homepage !== expectedHomepage) {
  mismatches.push(`homepage: expected ${expectedHomepage}, received ${metadata.homepage}`);
}
if (JSON.stringify(topics) !== JSON.stringify(expectedTopics)) {
  mismatches.push(`topics: expected ${expectedTopics.join(', ')}, received ${topics.join(', ')}`);
}

if (mismatches.length > 0) {
  console.error('Public repository metadata verification failed:');
  for (const mismatch of mismatches) {
    console.error(`- ${mismatch}`);
  }
  process.exit(1);
}

console.log(`Public metadata verified for ${repository}.`);
