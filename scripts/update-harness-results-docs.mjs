#!/usr/bin/env node

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = resolve(workspaceRoot, '.memory', 'capability-runs');
const packageDocsDir = resolve(workspaceRoot, 'packages/foundry-ai/docs');
const packageResultsDocPath = resolve(packageDocsDir, 'README.md');
const providerOrder = ['openai', 'anthropic', 'google', 'xai', 'third-party'];
const modelCapabilityColumns = [
  ['text.generate', 'Text'],
  ['chat.text.generate', 'Explicit chat'],
  ['messages.generate', 'History'],
  ['rid.passthrough', 'RID'],
  ['text.stream', 'Stream'],
  ['structured.output.object', 'JSON'],
  ['tool.loop.deterministic', 'Stream tools'],
  ['agent.tool_loop', 'Tools'],
  ['structured.plus.tools', 'JSON + tools'],
  ['vision.image_input', 'Image input'],
  ['reasoning.visibility', 'Reasoning stream'],
];

const rawArgs = process.argv.slice(2);
const artifactDir = resolveArtifactDir(rawArgs);
const resultsPath = join(artifactDir, 'results.json');
const record = JSON.parse(readFileSync(resultsPath, 'utf8'));
if (!record.finishedAt) {
  throw new Error('Cannot publish an incomplete live run. Inspect its local results.json instead.');
}
if (!/^[a-zA-Z0-9._-]+$/.test(record.runId)) {
  throw new Error(
    'Expected a run ID containing only letters, numbers, dots, underscores, or hyphens.',
  );
}
const outputTarget = resolveOutputTarget(rawArgs);
if (outputTarget === packageResultsDocPath) {
  throw new Error(
    'The live evidence index is curated. Keep raw reports in the local run directory.',
  );
}

const providerSummaries = summarizeProviders(record.cases);
const statusCounts = summarizeStatuses(record.cases);
const resultsDoc = createResultsDoc(record, artifactDir, providerSummaries, statusCounts);

if (outputTarget === 'stdout') {
  process.stdout.write(resultsDoc);
} else {
  mkdirSync(dirname(outputTarget), { recursive: true });
  writeFileSync(outputTarget, resultsDoc, 'utf8');
  process.stdout.write(
    `Wrote ${relativeToWorkspace(outputTarget)} from ${relativeToWorkspace(artifactDir)}.\n`,
  );
}

function resolveArtifactDir(args) {
  const artifactFlagIndex = args.indexOf('--artifact');

  if (artifactFlagIndex !== -1) {
    const artifactPath = args[artifactFlagIndex + 1];

    if (!artifactPath) {
      throw new Error('Expected a path after --artifact.');
    }

    return resolve(workspaceRoot, artifactPath);
  }

  const candidates = readdirSync(artifactRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(artifactRoot, entry.name))
    .sort()
    .reverse();

  const latest = candidates.at(0);

  if (!latest) {
    throw new Error(`No capability run artifacts found under ${artifactRoot}.`);
  }

  return latest;
}

function resolveOutputTarget(args) {
  const outputFlagIndex = args.indexOf('--output');
  const shouldWriteToStdout = args.includes('--stdout');

  if (outputFlagIndex !== -1 && shouldWriteToStdout) {
    throw new Error('Choose either --output or --stdout, not both.');
  }

  if (shouldWriteToStdout) {
    return 'stdout';
  }

  if (outputFlagIndex !== -1) {
    const outputPath = args[outputFlagIndex + 1];

    if (!outputPath) {
      throw new Error('Expected a path after --output.');
    }

    return resolve(workspaceRoot, outputPath);
  }

  return join(artifactDir, 'harness-capability-results.md');
}

function summarizeStatuses(cases) {
  const counts = cases.reduce((accumulator, testCase) => {
    accumulator[testCase.status] = (accumulator[testCase.status] ?? 0) + 1;
    return accumulator;
  }, {});

  return ['pass', 'skipped', 'proxy-rejected', 'unsupported', 'fail']
    .filter((status) => status in counts)
    .map((status) => [status, counts[status]]);
}

function summarizeProviders(cases) {
  const summaries = new Map();

  for (const testCase of cases) {
    const summary = summaries.get(testCase.provider) ?? {
      fail: 0,
      pass: 0,
      'proxy-rejected': 0,
      skipped: 0,
      unsupported: 0,
    };

    summary[testCase.status] += 1;
    summaries.set(testCase.provider, summary);
  }

  return providerOrder
    .filter((provider) => summaries.has(provider))
    .map((provider) => [provider, summaries.get(provider)]);
}

function createResultsDoc(record, artifactDir, providerSummaries, statusCounts) {
  const lines = [
    `# Live run: ${record.startedAt.slice(0, 10)}`,
    '',
    'This report covers one dated run and only the models and capabilities listed below. It is not a current catalog-wide support statement.',
    '',
    `- Run ID: \`${record.runId}\``,
    `- Git SHA: \`${record.gitSha}\``,
    `- Package Version: \`${record.packageVersion}\``,
    `- Installed SDK versions: ${
      record.sdk
        ? Object.entries(record.sdk)
            .map(([name, version]) => `${name}=\`${version}\``)
            .join(', ')
        : 'not recorded; do not infer them from current dependencies'
    }`,
    `- Artifact: \`${relativeToWorkspace(artifactDir)}\``,
    `- Started: ${record.startedAt}`,
    `- Finished: ${record.finishedAt}`,
    `- Default Models: ${Object.entries(record.models)
      .map(([provider, model]) => `${provider}=\`${model}\``)
      .join(', ')}`,
    `- Filters: ${formatFilters(record.filters)}`,
    `- Model Scope: \`${record.modelScope ?? 'canonical'}\``,
    `- Status Counts: ${statusCounts.map(([status, count]) => `\`${status}\`: ${count}`).join(', ')}`,
    '',
    'The default per-provider models are the hard gate; survey cases can record failures without failing the suite. Read case statuses rather than the process exit code. Skipped cases were not tested. Proxy-rejected cases describe rejected requests, not universal model limitations. Missing models and capabilities are unverified by this run.',
    '',
    '## Provider Summary',
    '',
    '| Provider | Pass | Skipped | Proxy Rejected | Unsupported | Fail |',
    '|---|---:|---:|---:|---:|---:|',
  ];

  for (const [provider, summary] of providerSummaries) {
    lines.push(
      `| ${provider} | ${summary.pass} | ${summary.skipped} | ${summary['proxy-rejected']} | ${summary.unsupported} | ${summary.fail} |`,
    );
  }

  lines.push(
    '',
    '## Provider Capability Tables',
    '',
    'Rows are models. Columns are the primary live language-model capabilities. Newer models appear first within each provider.',
  );

  for (const provider of providerOrder) {
    const table = createProviderCapabilityTable(record, provider);

    if (!table) {
      continue;
    }

    lines.push('', `### ${provider}`, '', ...table, '');
  }

  lines.push(
    '',
    '## Detailed Rows',
    '',
    '| Provider | Capability | Status | Model | Duration ms | Notes |',
    '|---|---|---|---|---:|---|',
  );

  for (const testCase of record.cases) {
    lines.push(
      `| ${testCase.provider} | ${testCase.capability} | ${testCase.status} | \`${testCase.modelId}\` | ${testCase.durationMs} | ${escapeTable(getCaseNote(testCase))} |`,
    );
  }

  const nonPassCases = record.cases.filter((testCase) => testCase.status !== 'pass');

  if (nonPassCases.length > 0) {
    lines.push('', '## Non-Pass Details', '');

    for (const testCase of nonPassCases) {
      lines.push(
        `### ${testCase.provider}.${testCase.capability}`,
        '',
        `- Status: \`${testCase.status}\``,
        `- Model: \`${testCase.modelId}\``,
        `- Notes: ${getCaseNote(testCase)}`,
        '',
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function getCaseNote(testCase) {
  if (typeof testCase?.error?.message === 'string') {
    return testCase.error.message;
  }

  if (Array.isArray(testCase.notes) && testCase.notes.length > 0) {
    return testCase.notes.join('; ');
  }

  return 'none';
}

function formatFilters(filters) {
  if (!filters || (filters.provider == null && filters.modelId == null)) {
    return 'none';
  }

  return [
    filters.provider ? `provider=\`${filters.provider}\`` : undefined,
    filters.modelId ? `model=\`${filters.modelId}\`` : undefined,
  ]
    .filter((value) => value != null)
    .join(', ');
}

function escapeTable(value) {
  return String(value).replaceAll('|', '\\|').replaceAll('\n', ' ');
}

function createProviderCapabilityTable(record, provider) {
  const providerCases = record.cases.filter(
    (testCase) =>
      testCase.provider === provider &&
      modelCapabilityColumns.some(([capability]) => capability === testCase.capability),
  );

  if (providerCases.length === 0) {
    return null;
  }

  const casesByModel = new Map();

  for (const testCase of providerCases) {
    const capabilities = casesByModel.get(testCase.modelId) ?? new Map();
    capabilities.set(testCase.capability, testCase);
    casesByModel.set(testCase.modelId, capabilities);
  }

  const orderedModels = getProviderModels(record, provider, casesByModel);
  const header = ['| Model |', ...modelCapabilityColumns.map(([, label]) => `${label} |`)].join(
    ' ',
  );
  const divider = ['|---|', ...modelCapabilityColumns.map(() => '---|')].join('');
  const rows = [header, divider];

  for (const modelId of orderedModels) {
    const capabilities = casesByModel.get(modelId) ?? new Map();
    const cells = modelCapabilityColumns.map(([capability]) =>
      formatStatusCell(capabilities.get(capability)?.status),
    );

    rows.push(`| \`${modelId}\` | ${cells.join(' | ')} |`);
  }

  return rows;
}

function getProviderModels(record, provider, casesByModel) {
  const configuredModels = Array.isArray(record.matrixModels?.[provider])
    ? record.matrixModels[provider]
    : [];

  if (configuredModels.length > 0) {
    return configuredModels.filter((modelId) => casesByModel.has(modelId));
  }

  return [...casesByModel.keys()];
}

function formatStatusCell(status) {
  if (status == null) {
    return '-';
  }

  if (status === 'proxy-rejected') {
    return 'proxy';
  }

  if (status === 'unsupported') {
    return 'unsupported';
  }

  return status;
}

function relativeToWorkspace(path) {
  return path.replace(`${workspaceRoot}/`, '');
}
