import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { packageByProject } from './packages.mjs';

const forbiddenPatterns = [
  /^docs\/(?!.*\.md$)/u,
  /^\.memory\//u,
  /^project\.json$/u,
  /^scripts\//u,
  /^src\//u,
  /^test\//u,
  /^tsconfig(?:\.|$)/u,
  /^vitest(?:\.|$)/u,
];

const audits = {
  'foundry-ai': {
    requiredFiles: [
      'README.md',
      'LICENSE',
      'NOTICE',
      'docs/README.md',
      'dist/providers/realtime.mjs',
      'dist/providers/realtime.cjs',
      'dist/providers/realtime.d.ts',
      'dist/providers/xai.mjs',
      'dist/providers/xai.cjs',
      'dist/providers/xai.d.ts',
      'package.json',
    ],
    checkManifest: checkAiSdkDeclarations,
  },
  'foundry-effect-ai': {
    requiredFiles: [
      'README.md',
      'LICENSE',
      'NOTICE',
      'package.json',
      'dist/src/FoundryClient.js',
      'dist/src/FoundryClient.d.ts',
    ],
    checkManifest: checkEffectPackage,
  },
};

const project = process.argv[2] ?? 'foundry-ai';
const { dir, name: expectedPackageName } = packageByProject(project);
const audit = audits[project];
if (audit == null) {
  throw new Error(`No package audit is defined for ${project}.`);
}
const packageRoot = resolve(dir);

const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: packageRoot,
  encoding: 'utf8',
});
const [packSummary] = JSON.parse(stdout);

if (packSummary == null || !Array.isArray(packSummary.files)) {
  throw new Error('npm pack --dry-run --json did not return a usable file list.');
}

const files = new Set(packSummary.files.map((entry) => entry.path));
const problems = [
  ...(packSummary.name === expectedPackageName
    ? []
    : [`Expected package name ${expectedPackageName}, received ${packSummary.name}.`]),
  ...audit.requiredFiles
    .filter((file) => !files.has(file))
    .map((file) => `Missing required published file: ${file}`),
  ...[...files]
    .filter((file) => forbiddenPatterns.some((pattern) => pattern.test(file)))
    .map((file) => `Unexpected file leaked into the published package: ${file}`),
  ...audit.checkManifest(files),
];

if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join('\n'));
  process.exit(1);
}

console.log(
  `Package audit passed for ${packSummary.name}@${packSummary.version} with ${packSummary.entryCount} files.`,
);

/**
 * Each entry's declarations stand alone and need no Node types, so a provider subpath typechecks
 * without the root entry or @types/node.
 */
function checkAiSdkDeclarations(packedFiles) {
  const found = [];
  for (const file of [...packedFiles].filter((path) => /\.d\.c?ts$/u.test(path))) {
    const source = readFileSync(join(packageRoot, file), 'utf8');
    if (/\bfrom\s*['"]\.{1,2}\//u.test(source) || /\bimport\s*['"]\.{1,2}\//u.test(source)) {
      found.push(
        `${file} imports another declaration file; each entry's declarations must stand alone.`,
      );
    }
    if (/\bNodeJS\.|\/\/\/\s*<reference\s+types=["']node["']/u.test(source)) {
      found.push(`${file} depends on Node's ambient types.`);
    }
  }
  return found;
}

/** effect is the only peer and nothing else is installed with the package. */
function checkEffectPackage(packedFiles) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const found = [];
  if (manifest.dependencies != null || manifest.optionalDependencies != null) {
    found.push('The Effect package must not declare dependencies; effect is its only peer.');
  }
  if (JSON.stringify(Object.keys(manifest.peerDependencies ?? {})) !== '["effect"]') {
    found.push('peerDependencies must contain exactly effect.');
  }
  if (manifest.type !== 'module' || manifest.sideEffects !== false) {
    found.push('The Effect package must be ESM with sideEffects: false.');
  }
  // Public modules resolve only through the wildcard; an exact key would expose internals.
  const expectedExports = {
    './package.json': './package.json',
    './internal/*': null,
    './*': {
      types: './dist/src/*.d.ts',
      default: './dist/src/*.js',
    },
  };
  if (JSON.stringify(manifest.exports) !== JSON.stringify(expectedExports)) {
    found.push(`exports must be exactly ${JSON.stringify(expectedExports)}.`);
  }
  if (manifest.main != null || manifest.module != null || manifest.types != null) {
    found.push('The Effect package has no root entry; import modules by subpath.');
  }
  for (const file of packedFiles) {
    if (/(^|\/)index\.(js|d\.ts)$/u.test(file)) {
      found.push(`Barrel file published: ${file}`);
    }
    if (file.endsWith('.js')) {
      const source = readFileSync(join(packageRoot, file), 'utf8');
      if (/from\s*["'](?:ai|@ai-sdk\/[^"']+|@effect\/ai-[^"']+)["']/u.test(source)) {
        found.push(`${file} imports a vendor AI SDK.`);
      }
    }
  }
  return found;
}
