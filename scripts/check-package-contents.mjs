import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { packageByProject } from './packages.mjs';

const forbiddenPatterns = [
  /^docs\/(?!.*\.md$)/,
  /^\.memory\//,
  /^project\.json$/,
  /^scripts\//,
  /^src\//,
  /^test\//,
  /^tsconfig(?:\.|$)/,
  /^vitest(?:\.|$)/,
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
    checkManifest: () => [],
  },
  'foundry-effect-ai': {
    requiredFiles: [
      'README.md',
      'LICENSE',
      'NOTICE',
      'package.json',
      'dist/foundry-effect-ai/src/FoundryClient.js',
      'dist/foundry-effect-ai/src/FoundryClient.d.ts',
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

/** effect is the only peer and nothing else is installed with the package. */
function checkEffectPackage(files) {
  const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
  const problems = [];
  if (manifest.dependencies != null || manifest.optionalDependencies != null) {
    problems.push('The Effect package must not declare dependencies; effect is its only peer.');
  }
  if (JSON.stringify(Object.keys(manifest.peerDependencies ?? {})) !== '["effect"]') {
    problems.push('peerDependencies must contain exactly effect.');
  }
  if (manifest.type !== 'module' || manifest.sideEffects !== false) {
    problems.push('The Effect package must be ESM with sideEffects: false.');
  }
  if (manifest.main != null || manifest.module != null || manifest.exports?.['.'] != null) {
    problems.push('The Effect package has no root entry; import modules by subpath.');
  }
  for (const file of files) {
    if (/(^|\/)index\.(js|d\.ts)$/.test(file)) {
      problems.push(`Barrel file published: ${file}`);
    }
    if (file.endsWith('.js')) {
      const source = readFileSync(join(packageRoot, file), 'utf8');
      if (/from\s*["'](?:ai|@ai-sdk\/[^"']+|@effect\/ai-[^"']+)["']/.test(source)) {
        problems.push(`${file} imports a vendor AI SDK.`);
      }
    }
  }
  return problems;
}
