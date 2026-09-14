import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';

const workspaceRoot = resolve(import.meta.dirname, '../../../..');
let fixtureRoot: string;
let script: string;
let artifact: string;
let index: string;
const record = {
  runId: '2026-09-13-filtered-test',
  gitSha: 'test-sha',
  packageVersion: '0.0.7',
  sdk: { ai: '7.0.97' },
  startedAt: '2026-09-13T12:00:00Z',
  finishedAt: '2026-09-13T12:01:00Z',
  models: { openai: 'gpt-5-nano', anthropic: 'claude-haiku-4.5', google: 'gemini-3.1-flash-lite' },
  filters: { provider: 'google', modelId: 'gemini-3.8-flash' },
  modelScope: 'catalog',
  cases: [
    {
      provider: 'google',
      modelId: 'gemini-3.8-flash',
      capability: 'text.generate',
      status: 'pass',
      durationMs: 12,
    },
  ],
};

beforeEach(() => {
  mkdirSync(join(workspaceRoot, '.memory'), { recursive: true });
  fixtureRoot = mkdtempSync(join(workspaceRoot, '.memory/results-docs-test-'));
  script = join(fixtureRoot, 'scripts/update-harness-results-docs.mjs');
  artifact = join(fixtureRoot, '.memory/capability-runs', record.runId);
  index = join(fixtureRoot, 'packages/foundry-ai/docs/README.md');
  mkdirSync(join(fixtureRoot, 'scripts'), { recursive: true });
  mkdirSync(artifact, { recursive: true });
  mkdirSync(join(fixtureRoot, 'packages/foundry-ai/docs'), { recursive: true });
  copyFileSync(join(workspaceRoot, 'scripts/update-harness-results-docs.mjs'), script);
  writeFileSync(join(artifact, 'results.json'), JSON.stringify(record));
  writeFileSync(index, 'Curated coverage across runs');
});

afterEach(() => rmSync(fixtureRoot, { recursive: true, force: true }));

it('keeps a filtered run local without replacing the evidence index', () => {
  execFileSync(process.execPath, [script, '--artifact', artifact]);
  expect(readFileSync(index, 'utf8')).toBe('Curated coverage across runs');
  const output = readFileSync(join(artifact, 'harness-capability-results.md'), 'utf8');
  expect(output).toContain('google');
  expect(output).toContain('model=`gemini-3.8-flash`');
  expect(output).toContain('ai=`7.0.97`');
  expect(output).toContain('not a current catalog-wide support statement');
});

it('rejects incomplete reports and preserves the index', () => {
  writeFileSync(
    join(artifact, 'results.json'),
    JSON.stringify({ ...record, finishedAt: undefined }),
  );
  expect(() =>
    execFileSync(process.execPath, [script, '--artifact', artifact], { stdio: 'pipe' }),
  ).toThrow('incomplete live run');
  expect(readFileSync(index, 'utf8')).toBe('Curated coverage across runs');
});

it('prevents explicit output from replacing the curated index', () => {
  expect(() =>
    execFileSync(process.execPath, [script, '--artifact', artifact, '--output', index], {
      stdio: 'pipe',
    }),
  ).toThrow('index is curated');
  expect(readFileSync(index, 'utf8')).toBe('Curated coverage across runs');
});

it('labels missing historical SDK versions instead of using current dependencies', () => {
  writeFileSync(join(artifact, 'results.json'), JSON.stringify({ ...record, sdk: undefined }));
  const output = execFileSync(process.execPath, [script, '--artifact', artifact, '--stdout'], {
    encoding: 'utf8',
  });
  expect(output).toContain('Installed SDK versions: not recorded');
});
