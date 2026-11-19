// The npm packages this repository releases independently, keyed by Nx project.
import { readFileSync } from 'node:fs';

export const packages = [
  { project: 'foundry-ai', dir: 'packages/foundry-ai', name: '@nyrra/foundry-ai' },
  {
    project: 'foundry-effect-ai',
    dir: 'packages/foundry-effect-ai',
    name: '@nyrra/foundry-effect-ai',
  },
];

export function packageByProject(project) {
  const match = packages.find((entry) => entry.project === project);
  if (match == null) {
    throw new Error(
      `Unknown package project ${project}; expected one of ${packages.map((entry) => entry.project).join(', ')}.`,
    );
  }
  return match;
}

export function readManifest({ dir }) {
  return JSON.parse(readFileSync(`${dir}/package.json`, 'utf8'));
}

/** Packages marked private are built and audited but never published. */
export function isPublishable(entry) {
  return readManifest(entry).private !== true;
}
