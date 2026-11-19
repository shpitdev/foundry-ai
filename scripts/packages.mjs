// The npm packages this repository releases independently, keyed by Nx project.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const packages = [
  { project: 'foundry-ai', dir: 'packages/foundry-ai', name: '@shpitdev/foundry-ai' },
  {
    project: 'foundry-effect-ai',
    dir: 'packages/foundry-effect-ai',
    name: '@shpitdev/foundry-effect-ai',
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

/** npm access: public packages publish with provenance; restricted ones cannot have it. */
export function readAccess(entry) {
  const access = readManifest(entry).publishConfig?.access;
  if (access !== 'public' && access !== 'restricted') {
    throw new Error(
      `${entry.dir}/package.json needs publishConfig.access "public" or "restricted".`,
    );
  }
  return access;
}

/**
 * The package's npm dist-tags. Every publishable package exists on npm (its first version is
 * published by hand), so a failed lookup is an error: usually missing read access to a restricted
 * package, which npm reports as not found.
 */
export function readDistTags({ name }) {
  try {
    return JSON.parse(
      execFileSync(
        'npm',
        ['view', name, 'dist-tags', '--json', '--registry=https://registry.npmjs.org'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      ),
    );
  } catch (error) {
    throw new Error(
      `Cannot read npm dist-tags for ${name}. Restricted packages need an npm login (NPM_READ_TOKEN in CI).\n${error.stderr || error.message}`,
    );
  }
}
