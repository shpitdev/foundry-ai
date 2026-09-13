import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const packageRoot = resolve('packages/foundry-ai');
const expectedPackageName = '@nyrra/foundry-ai';
const requiredFiles = [
  'README.md',
  'LICENSE',
  'NOTICE',
  'docs/ai-sdk-community-provider.mdx',
  'docs/dependency-strategy.md',
  'docs/harness-capability-results.md',
  'docs/model-support.md',
  'docs/third-party-model-support.md',
  'dist/providers/third-party.mjs',
  'dist/providers/third-party.cjs',
  'dist/providers/third-party.d.ts',
  'docs/usage.md',
  'package.json',
  'skills/foundry-ai-provider/SKILL.md',
  'skills/foundry-ai-provider/agents/openai.yaml',
  'skills/foundry-ai-provider/references/examples/provider-registry.ts',
  'skills/foundry-ai-provider/references/examples/config.ts',
  'skills/foundry-ai-provider/references/examples/logger.ts',
  'skills/foundry-ai-provider/references/examples/model.ts',
  'skills/foundry-ai-provider/references/examples/tools.ts',
  'skills/foundry-ai-provider/references/examples/tool-calling-streaming.ts',
  'skills/foundry-ai-provider/references/examples/tool-calling.ts',
  'skills/foundry-ai-provider/references/provider-behavior.md',
  'skills/foundry-ai-provider/references/runtime-setup.md',
];
const forbiddenPatterns = [
  /^\.memory\//,
  /^project\.json$/,
  /^scripts\//,
  /^skills\/_artifacts\//,
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
