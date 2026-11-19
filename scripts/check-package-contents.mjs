import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const packageRoot = resolve('packages/foundry-ai');
const expectedPackageName = '@nyrra/foundry-ai';
const requiredFiles = [
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
];
const forbiddenPatterns = [
  /^docs\/(?!.*\.md$)/,
  /^\.memory\//,
  /^project\.json$/,
  /^scripts\//,
  /^src\//,
  /^tsconfig(?:\.|$)/,
  /^vitest(?:\.|$)/,
];

const stdout = execFileSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: packageRoot,
  encoding: 'utf8',
});
const [packSummary] = JSON.parse(stdout);

if (packSummary == null || !Array.isArray(packSummary.files)) {
  throw new Error('npm pack --dry-run --json did not return a usable file list.');
}

const files = new Set(packSummary.files.map((entry) => entry.path));
const missingFiles = requiredFiles.filter((file) => !files.has(file));
const forbiddenFiles = [...files].filter((file) =>
  forbiddenPatterns.some((pattern) => pattern.test(file)),
);
if (
  packSummary.name !== expectedPackageName ||
  missingFiles.length > 0 ||
  forbiddenFiles.length > 0
) {
  if (packSummary.name !== expectedPackageName) {
    console.error(`Expected package name ${expectedPackageName}, received ${packSummary.name}.`);
  }

  if (missingFiles.length > 0) {
    console.error('Missing required published files:');
    for (const file of missingFiles) {
      console.error(`- ${file}`);
    }
  }

  if (forbiddenFiles.length > 0) {
    console.error('Unexpected files leaked into the published package:');
    for (const file of forbiddenFiles) {
      console.error(`- ${file}`);
    }
  }
  process.exit(1);
}

console.log(
  `Package audit passed for ${packSummary.name}@${packSummary.version} with ${packSummary.entryCount} files.`,
);
