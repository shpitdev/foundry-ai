import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const workspaceRoot = process.cwd();
const [exampleName, ...exampleArgs] = process.argv.slice(2);

if (!exampleName) {
  fail('Usage: pnpm run example <example-name> [args...]');
}

const examplePath = resolveExamplePath(exampleName);

if (!existsSync(examplePath)) {
  fail(`Unknown example: ${exampleName}`);
}

run('pnpm', ['run', 'build']);

if (spawnSync('bun', ['--version'], { stdio: 'ignore' }).status === 0) {
  run('bun', [examplePath, ...exampleArgs]);
} else {
  run('node', ['--import', 'tsx', examplePath, ...exampleArgs]);
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: workspaceRoot,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveExamplePath(name) {
  const normalizedName = resolveExampleAlias(name.endsWith('.ts') ? name : `${name}.ts`);
  const candidates = normalizedName.includes('/')
    ? [resolve(workspaceRoot, 'examples', normalizedName)]
    : [
        resolve(workspaceRoot, 'examples', normalizedName),
        resolve(workspaceRoot, 'examples', 'base', normalizedName),
        resolve(workspaceRoot, 'examples', 'advanced', normalizedName),
      ];

  const match = candidates.find((candidate) => existsSync(candidate));
  if (match === undefined) {
    fail(`Unknown example: ${name}`);
  }
  return match;
}

function resolveExampleAlias(name) {
  if (name === 'tool-calling-exa-devtools.ts') {
    return 'tool-calling-devtools.ts';
  }

  if (name === 'tool-calling-exa-parallel-devtools.ts') {
    return 'tool-calling-parallel-devtools.ts';
  }

  if (name === 'exa-tool-calling-devtools.ts') {
    return 'tool-calling-devtools.ts';
  }

  if (name === 'exa-tool-calling-parallel-devtools.ts') {
    return 'tool-calling-parallel-devtools.ts';
  }

  return name;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
