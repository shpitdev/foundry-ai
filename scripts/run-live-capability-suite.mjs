#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './run-live-capability-suite-lib.mjs';

const workspaceRoot = process.cwd();
const artifactRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '.memory',
  'capability-runs',
);
const runId = createRunId();
const artifactPath = `.memory/capability-runs/${runId}`;
const artifactSummaryPath = `${artifactPath}/harness-capability-results.md`;
const artifactResultsPath = join(workspaceRoot, artifactPath, 'results.json');
const { extraEnv, extraVitestArgs } = parseArgs(process.argv.slice(2));

const testExitCode = await runCommandWithProgress(
  'pnpm',
  [
    'exec',
    'vitest',
    'run',
    '--config',
    'packages/foundry-ai/vitest.live.config.ts',
    ...extraVitestArgs,
  ],
  { LIVE_CAPABILITY_RUN_ID: runId, ...extraEnv },
);

let exitCode = testExitCode;
const hasResultsArtifact = existsSync(artifactResultsPath);

if (hasResultsArtifact) {
  const artifactSummaryExitCode = await runCommand('node', [
    'scripts/update-harness-results-docs.mjs',
    '--artifact',
    artifactPath,
    '--output',
    artifactSummaryPath,
  ]);

  if (artifactSummaryExitCode !== 0 && exitCode === 0) {
    exitCode = artifactSummaryExitCode;
  }
} else if (exitCode === 0) {
  process.stderr.write(
    `Expected a live capability artifact at ${artifactResultsPath}, but no results were written.\n`,
  );
  exitCode = 1;
}

process.exit(exitCode);

function runCommand(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: process.env,
      stdio: 'inherit',
    });

    child.on('exit', (code, signal) => {
      if (signal) {
        process.stderr.write(`${command} terminated with signal ${signal}.\n`);
        resolve(1);
        return;
      }

      resolve(code ?? 1);
    });
  });
}

function runCommandWithProgress(command, args, extraEnv) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: workspaceRoot,
      env: { ...process.env, ...extraEnv },
      stdio: 'inherit',
    });
    let lastProgressKey = '';
    let progressTimer = setInterval(() => {
      const snapshot = readProgressSnapshot(runId);

      if (!snapshot) {
        return;
      }

      const progressKey = `${snapshot.runId}:${snapshot.caseCount}:${snapshot.latestCaseKey}`;

      if (progressKey === lastProgressKey) {
        return;
      }

      lastProgressKey = progressKey;
      process.stdout.write(
        `[live:progress] run=${snapshot.runId} cases=${snapshot.caseCount} ${snapshot.statusSummary}${snapshot.latestCaseKey ? ` latest=${snapshot.latestCaseKey}` : ''}\n`,
      );
    }, 2_000);

    child.on('exit', (code, signal) => {
      clearInterval(progressTimer);
      progressTimer = null;

      if (signal) {
        process.stderr.write(`${command} terminated with signal ${signal}.\n`);
        resolve(1);
        return;
      }

      resolve(code ?? 1);
    });
  });
}

function readProgressSnapshot(currentRunId) {
  const runDir = join(artifactRoot, currentRunId);
  const resultsPath = join(runDir, 'results.json');

  if (!existsSync(resultsPath)) {
    return null;
  }

  try {
    const record = JSON.parse(readFileSync(resultsPath, 'utf8'));
    const counts = summarizeStatuses(record.cases ?? []);
    const latestCase = Array.isArray(record.cases) ? record.cases.at(-1) : undefined;

    return {
      caseCount: Array.isArray(record.cases) ? record.cases.length : 0,
      latestCaseKey: latestCase
        ? `${latestCase.provider}:${latestCase.modelId}:${latestCase.capability}=${latestCase.status}`
        : '',
      runId: record.runId ?? currentRunId,
      statusSummary: Object.entries(counts)
        .map(([status, count]) => `${status}=${count}`)
        .join(' '),
    };
  } catch {
    return null;
  }
}

function summarizeStatuses(cases) {
  return cases.reduce((counts, testCase) => {
    counts[testCase.status] = (counts[testCase.status] ?? 0) + 1;
    return counts;
  }, {});
}

function createRunId() {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  return `${timestamp}-${Math.random().toString(16).slice(2, 8)}`;
}
