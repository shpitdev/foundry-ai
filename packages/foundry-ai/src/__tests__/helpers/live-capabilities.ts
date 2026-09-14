import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { OpenTelemetry } from '@ai-sdk/otel';
import { type Context, trace } from '@opentelemetry/api';
import type { Telemetry, TelemetryOptions } from 'ai';
import { MODEL_CATALOG, resolveKnownModelMetadata, resolveModelRid } from '../../models/catalog.js';
import { loadLiveFoundryConfig } from './live-foundry.js';

export type LiveProvider = 'openai' | 'anthropic' | 'google' | 'third-party';
export type CapabilityExpectation = 'must-pass' | 'investigate' | 'expect-unsupported';
export type CapabilityStatus = 'pass' | 'fail' | 'unsupported' | 'proxy-rejected' | 'skipped';

export interface CapabilityResult {
  capability: string;
  provider: LiveProvider;
  modelId: string;
  expectation: CapabilityExpectation;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: CapabilityStatus;
  finishReason?: string;
  warnings?: unknown;
  usage?: unknown;
  output?: unknown;
  error?: unknown;
  notes?: string[];
  telemetry?: {
    eventCounts: Record<string, number>;
    events: unknown[];
    traceIds: string[];
    spanIds: string[];
  };
}

export interface CapabilityCaseSpec {
  capability: string;
  expectation: CapabilityExpectation;
  modelId: string;
  provider: LiveProvider;
}

export interface LiveCapabilityFilters {
  modelId?: string;
  provider?: LiveProvider;
}

interface CapabilityRunRecord {
  version: 1;
  runId: string;
  gitSha: string;
  packageVersion: string;
  sdk: Record<string, string>;
  startedAt: string;
  finishedAt?: string;
  artifactDir: string;
  models: Record<LiveProvider, string>;
  matrixModels: Record<LiveProvider, string[]>;
  modelOverrides: Partial<Record<LiveProvider, string>>;
  filters: LiveCapabilityFilters;
  modelScope: 'canonical' | 'catalog';
  telemetry: {
    mode: 'local-file-tracer';
    recordInputs: true;
    recordOutputs: true;
  };
  cases: CapabilityResult[];
}

interface SerializableSpanRecord {
  attributes: Record<string, unknown>;
  caseKey: string;
  endedAt?: string;
  events: Array<{
    attributes?: Record<string, unknown>;
    name: string;
    timestamp: string;
  }>;
  name: string;
  parentSpanId?: string;
  spanId: string;
  startedAt: string;
  status?: unknown;
  traceId: string;
}

interface LiveSpan {
  addEvent(name: string, attributes?: Record<string, unknown>): void;
  end(endTime?: number): void;
  recordException(error: unknown): void;
  setAttribute(key: string, value: unknown): LiveSpan;
  setAttributes(attributes: Record<string, unknown>): LiveSpan;
  setStatus(status: unknown): LiveSpan;
  spanContext(): {
    isRemote: false;
    spanId: string;
    traceFlags: 1;
    traceId: string;
  };
  updateName(name: string): LiveSpan;
}

const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4.5',
  google: 'gemini-3.1-flash-lite',
  openai: 'gpt-5-nano',
  'third-party': 'qwen3-32b',
} as const satisfies Record<LiveProvider, string>;

const LIVE_ARTIFACT_ROOT_ENV = 'LIVE_CAPABILITY_ARTIFACT_DIR';
const LIVE_MODEL_FILTER_ENV = 'LIVE_MODEL_FILTER';
const LIVE_RUN_ID_ENV = 'LIVE_CAPABILITY_RUN_ID';
const LIVE_PROVIDER_FILTER_ENV = 'LIVE_PROVIDER_FILTER';
const LIVE_MODEL_SCOPE_ENV = 'LIVE_MODEL_SCOPE';
const LIVE_MODELS_ENV = {
  anthropic: 'LIVE_ANTHROPIC_MODEL',
  google: 'LIVE_GOOGLE_MODEL',
  openai: 'LIVE_OPENAI_MODEL',
  'third-party': 'LIVE_THIRD_PARTY_MODEL',
} as const satisfies Record<LiveProvider, string>;

export const TINY_PNG_BYTES = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Z0p8AAAAASUVORK5CYII=',
    'base64',
  ),
);

export class CapabilityUnsupportedError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CapabilityUnsupportedError';
    this.details = details;
  }
}

export class CapabilitySkippedError extends Error {
  readonly details?: Record<string, unknown>;

  constructor(message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'CapabilitySkippedError';
    this.details = details;
  }
}

export function getLiveCapabilityModels(): Record<LiveProvider, string> {
  loadLiveFoundryConfig();

  return {
    anthropic: process.env[LIVE_MODELS_ENV.anthropic]?.trim() || DEFAULT_MODELS.anthropic,
    google: process.env[LIVE_MODELS_ENV.google]?.trim() || DEFAULT_MODELS.google,
    openai: process.env[LIVE_MODELS_ENV.openai]?.trim() || DEFAULT_MODELS.openai,
    'third-party':
      process.env[LIVE_MODELS_ENV['third-party']]?.trim() || DEFAULT_MODELS['third-party'],
  };
}

export function getLiveCapabilityFilters(): LiveCapabilityFilters {
  const providerValue = process.env[LIVE_PROVIDER_FILTER_ENV]?.trim().toLowerCase();
  const modelId = process.env[LIVE_MODEL_FILTER_ENV]?.trim() || undefined;

  if (!providerValue) {
    return modelId ? { modelId } : {};
  }

  if (!isLiveProvider(providerValue)) {
    throw new Error(
      `Expected ${LIVE_PROVIDER_FILTER_ENV} to be one of openai, anthropic, google, third-party. Received "${providerValue}".`,
    );
  }

  return modelId ? { modelId, provider: providerValue } : { provider: providerValue };
}

export function shouldIncludeLiveCapabilityCase(provider: LiveProvider, modelId?: string): boolean {
  const filters = getLiveCapabilityFilters();

  if (filters.provider && filters.provider !== provider) {
    return false;
  }

  if (filters.modelId) {
    return modelId != null && filters.modelId === modelId;
  }

  return true;
}

export function getLiveCapabilityModelScope(): 'canonical' | 'catalog' {
  const value = process.env[LIVE_MODEL_SCOPE_ENV]?.trim().toLowerCase();

  if (value === 'catalog') {
    return 'catalog';
  }

  return 'canonical';
}

export function getLiveCapabilityModelMatrix(): Record<LiveProvider, string[]> {
  const models = getLiveCapabilityModels();

  if (getLiveCapabilityModelScope() === 'canonical') {
    return filterLiveCapabilityModelMatrix({
      anthropic: [models.anthropic],
      google: [models.google],
      openai: [models.openai],
      'third-party': [],
    });
  }

  return filterLiveCapabilityModelMatrix({
    anthropic: mergePreferredModelId(models.anthropic, getKnownProviderModelIds('anthropic')),
    google: mergePreferredModelId(models.google, getKnownProviderModelIds('google')),
    openai: mergePreferredModelId(models.openai, getKnownProviderModelIds('openai')),
    'third-party': mergePreferredModelId(
      models['third-party'],
      getKnownProviderModelIds('third-party'),
    ),
  });
}

export function getLiveCapabilityRid(provider: LiveProvider): string {
  return resolveModelRid(getLiveCapabilityModels()[provider] as never);
}

export function getEmbeddingProbeModelIds(): Partial<Record<LiveProvider, readonly string[]>> {
  loadLiveFoundryConfig();

  return {
    openai: process.env.LIVE_OPENAI_EMBEDDING_MODEL?.trim()
      ? [process.env.LIVE_OPENAI_EMBEDDING_MODEL.trim()]
      : ['text-embedding-3-small', 'text-embedding-3-large'],
    ...(process.env.LIVE_GOOGLE_EMBEDDING_MODEL?.trim()
      ? { google: [process.env.LIVE_GOOGLE_EMBEDDING_MODEL.trim()] }
      : {}),
  };
}

export function getVisionProbeModelIds(): Partial<Record<LiveProvider, string>> {
  loadLiveFoundryConfig();

  return {
    ...(process.env.LIVE_ANTHROPIC_VISION_MODEL?.trim()
      ? { anthropic: process.env.LIVE_ANTHROPIC_VISION_MODEL.trim() }
      : {}),
    ...(process.env.LIVE_GOOGLE_VISION_MODEL?.trim()
      ? { google: process.env.LIVE_GOOGLE_VISION_MODEL.trim() }
      : {}),
    ...(process.env.LIVE_OPENAI_VISION_MODEL?.trim()
      ? { openai: process.env.LIVE_OPENAI_VISION_MODEL.trim() }
      : {}),
  };
}

export function createVisionMessages(prompt: string, image: string | Uint8Array | Buffer | URL) {
  return [
    {
      role: 'user' as const,
      content: [
        {
          type: 'text' as const,
          text: prompt,
        },
        {
          type: 'image' as const,
          image,
        },
      ],
    },
  ];
}

export function assertModelClaimsVision(provider: LiveProvider, modelId: string) {
  const metadata = resolveKnownModelMetadata(modelId as never);

  if (metadata.provider !== provider) {
    throw new Error(
      `Expected ${provider} metadata for "${modelId}", received ${metadata.provider}.`,
    );
  }

  if (!metadata.supportsVision) {
    throw new CapabilitySkippedError(`Model "${modelId}" does not claim vision support.`, {
      modelId,
      provider,
      supportsVision: metadata.supportsVision,
    });
  }
}

let visionProbeImageBytesPromise: Promise<Uint8Array> | undefined;

export function getVisionProbeImageBytes() {
  visionProbeImageBytesPromise ??= fetchVisionProbeImageBytes();
  return visionProbeImageBytesPromise;
}

export class LiveCapabilityRecorder {
  private readonly artifactDir: string;
  private readonly caseEvents = new Map<string, unknown[]>();
  private readonly caseEventCounts = new Map<string, Map<string, number>>();
  private readonly caseTraceIds = new Map<string, Set<string>>();
  private readonly caseSpanIds = new Map<string, Set<string>>();
  private readonly record: CapabilityRunRecord;
  private readonly spans: SerializableSpanRecord[] = [];
  private snapshotWrite = Promise.resolve();

  constructor() {
    const filters = getLiveCapabilityFilters();
    const models = getLiveCapabilityModels();
    const matrixModels = getLiveCapabilityModelMatrix();
    const runId = process.env[LIVE_RUN_ID_ENV]?.trim() || createRunId();
    const artifactRoot = process.env[LIVE_ARTIFACT_ROOT_ENV]?.trim()
      ? resolve(process.env[LIVE_ARTIFACT_ROOT_ENV] as string)
      : resolve(process.cwd(), '.memory', 'capability-runs');

    this.artifactDir = join(artifactRoot, runId);
    this.record = {
      version: 1,
      runId,
      gitSha: resolveGitSha(),
      packageVersion: resolvePackageVersion(),
      sdk: resolveSdkVersions(),
      startedAt: new Date().toISOString(),
      artifactDir: this.artifactDir,
      models,
      matrixModels,
      modelOverrides: getModelOverrides(),
      filters,
      modelScope: getLiveCapabilityModelScope(),
      telemetry: {
        mode: 'local-file-tracer',
        recordInputs: true,
        recordOutputs: true,
      },
      cases: [],
    };
  }

  createTelemetry(
    caseKey: string,
    capability: string,
    provider: LiveProvider,
    modelId: string,
  ): TelemetryOptions {
    const integration = {
      onStart: (event: unknown) => this.recordEvent(caseKey, 'onStart', event),
      onStepStart: (event: unknown) => this.recordEvent(caseKey, 'onStepStart', event),
      onToolExecutionStart: (event: unknown) => this.recordEvent(caseKey, 'onToolCallStart', event),
      onToolExecutionEnd: (event: unknown) => this.recordEvent(caseKey, 'onToolCallFinish', event),
      onStepEnd: (event: unknown) => this.recordEvent(caseKey, 'onStepFinish', event),
      onEnd: (event: unknown) => this.recordEvent(caseKey, 'onFinish', event),
    } satisfies Telemetry;
    const tracer = new LocalFileTracer(caseKey, this);

    return {
      isEnabled: true,
      functionId: `${provider}.${capability}`,
      integrations: [
        integration,
        new OpenTelemetry({
          tracer: tracer as unknown as NonNullable<
            ConstructorParameters<typeof OpenTelemetry>[0]
          >['tracer'],
          enrichSpan: () => ({
            capability,
            caseKey,
            gitSha: this.record.gitSha,
            modelId,
            provider,
            runId: this.record.runId,
            testFile: 'packages/foundry-ai/src/__tests__/foundry.live.test.ts',
            testName: caseKey,
          }),
        }),
      ],
      recordInputs: true,
      recordOutputs: true,
    } satisfies TelemetryOptions;
  }

  async runCase<T>(
    spec: CapabilityCaseSpec,
    fn: (telemetry: TelemetryOptions, caseKey: string) => Promise<T>,
  ): Promise<T | undefined> {
    const startedAt = Date.now();
    const caseKey = createCaseKey(spec.provider, spec.modelId, spec.capability);
    const telemetry = this.createTelemetry(caseKey, spec.capability, spec.provider, spec.modelId);
    let output: T;

    this.logCaseStart(spec);

    try {
      output = await fn(telemetry, caseKey);
    } catch (error) {
      const status = classifyCapabilityError(error);
      const result = this.createResult(spec, startedAt, status, {
        error: sanitizeForArtifact(error),
      });

      this.recordCaseResult(result);

      if (spec.expectation === 'investigate') {
        return undefined;
      }

      if (spec.expectation === 'expect-unsupported') {
        if (status === 'unsupported' || status === 'proxy-rejected') {
          return undefined;
        }

        throw error;
      }

      throw error;
    }

    const result = this.createResult(spec, startedAt, 'pass', { output });

    if (spec.expectation === 'expect-unsupported') {
      result.status = 'fail';
      result.notes = [
        `Expected unsupported behavior for ${spec.provider}.${spec.capability}, but the capability succeeded.`,
      ];
      this.recordCaseResult(result);
      throw new Error(result.notes[0]);
    }

    this.recordCaseResult(result);
    return output;
  }

  recordSkippedCase(spec: CapabilityCaseSpec, message: string, details?: Record<string, unknown>) {
    const result = this.createResult(spec, Date.now(), 'skipped', {
      error: sanitizeForArtifact(new CapabilitySkippedError(message, details)),
    });

    this.recordCaseResult(result);
  }

  async flush() {
    this.record.finishedAt = new Date().toISOString();
    await this.queueSnapshotWrite();
  }

  recordSpan(record: SerializableSpanRecord) {
    this.spans.push(record);
    this.getTraceIds(record.caseKey).add(record.traceId);
    this.getSpanIds(record.caseKey).add(record.spanId);
  }

  private createResult(
    spec: CapabilityCaseSpec,
    startedAtMs: number,
    status: CapabilityStatus,
    extras: {
      error?: unknown;
      output?: unknown;
    },
  ): CapabilityResult {
    const finishedAtMs = Date.now();
    const caseKey = createCaseKey(spec.provider, spec.modelId, spec.capability);

    return {
      capability: spec.capability,
      provider: spec.provider,
      modelId: spec.modelId,
      expectation: spec.expectation,
      startedAt: new Date(startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      durationMs: finishedAtMs - startedAtMs,
      status,
      ...extras,
      telemetry: {
        eventCounts: Object.fromEntries(this.getEventCounts(caseKey).entries()),
        events: [...(this.caseEvents.get(caseKey) ?? [])],
        traceIds: [...this.getTraceIds(caseKey)],
        spanIds: [...this.getSpanIds(caseKey)],
      },
    };
  }

  private logCaseStart(spec: {
    capability: string;
    expectation: CapabilityExpectation;
    modelId: string;
    provider: LiveProvider;
  }) {
    console.log(
      `[live:start] ${spec.provider}:${spec.modelId}:${spec.capability} (${spec.expectation})`,
    );
  }

  private logCaseResult(result: CapabilityResult) {
    const counts = summarizeCaseStatuses(this.record.cases);
    const countsLabel = ['pass', 'skipped', 'proxy-rejected', 'unsupported', 'fail']
      .filter((status) => (counts[status] ?? 0) > 0)
      .map((status) => `${status}=${counts[status]}`)
      .join(' ');
    const countsSuffix = countsLabel.length > 0 ? ` (${countsLabel})` : '';
    const durationLabel = result.status === 'skipped' ? '' : ` ${result.durationMs}ms`;

    console.log(
      `[live:${result.status}] ${formatCapabilityStatusLabel(result.status)} ${result.provider}:${result.modelId}:${result.capability}${durationLabel}${countsSuffix}`,
    );
  }

  private queueSnapshotWrite() {
    this.snapshotWrite = this.snapshotWrite
      .catch((error) => {
        console.error('[live:snapshot] Previous incremental snapshot write failed:', error);
      })
      .then(async () => {
        await mkdir(this.artifactDir, { recursive: true });
        await writeFile(
          join(this.artifactDir, 'results.json'),
          JSON.stringify(sanitizeForArtifact(this.record), null, 2),
          'utf8',
        );
        await writeFile(
          join(this.artifactDir, 'summary.md'),
          createMarkdownSummary(this.record),
          'utf8',
        );
        await writeFile(
          join(this.artifactDir, 'otel-spans.json'),
          JSON.stringify(sanitizeForArtifact(this.spans), null, 2),
          'utf8',
        );
      });

    return this.snapshotWrite;
  }

  private recordCaseResult(result: CapabilityResult) {
    this.record.cases.push(result);
    this.logCaseResult(result);
    void this.queueSnapshotWrite().catch((error) => {
      console.error('[live:snapshot] Failed to write incremental snapshot:', error);
    });
  }

  private recordEvent(caseKey: string, eventType: string, event: unknown) {
    const events = this.caseEvents.get(caseKey) ?? [];
    const counts = this.getEventCounts(caseKey);

    events.push({
      event: eventType,
      payload: sanitizeForArtifact(event),
      timestamp: new Date().toISOString(),
    });
    counts.set(eventType, (counts.get(eventType) ?? 0) + 1);
    this.caseEvents.set(caseKey, events);
  }

  private getEventCounts(caseKey: string) {
    const counts = this.caseEventCounts.get(caseKey);

    if (counts) {
      return counts;
    }

    const next = new Map<string, number>();
    this.caseEventCounts.set(caseKey, next);
    return next;
  }

  private getSpanIds(caseKey: string) {
    const spanIds = this.caseSpanIds.get(caseKey);

    if (spanIds) {
      return spanIds;
    }

    const next = new Set<string>();
    this.caseSpanIds.set(caseKey, next);
    return next;
  }

  private getTraceIds(caseKey: string) {
    const traceIds = this.caseTraceIds.get(caseKey);

    if (traceIds) {
      return traceIds;
    }

    const next = new Set<string>();
    this.caseTraceIds.set(caseKey, next);
    return next;
  }
}

class LocalFileTracer {
  private readonly activeSpans: LocalSpanRecord[] = [];
  private readonly caseKey: string;
  private readonly recorder: LiveCapabilityRecorder;

  constructor(caseKey: string, recorder: LiveCapabilityRecorder) {
    this.caseKey = caseKey;
    this.recorder = recorder;
  }

  startActiveSpan(name: string, ...args: unknown[]) {
    const { callback, options } = normalizeSpanArgs(args);
    const span = this.startSpan(name, options);

    if (callback == null) {
      return span;
    }

    this.activeSpans.push(span);

    try {
      const result = callback(span);

      if (isPromiseLike(result)) {
        return Promise.resolve(result).finally(() => {
          this.activeSpans.pop();
        });
      }

      this.activeSpans.pop();
      return result;
    } catch (error) {
      this.activeSpans.pop();
      throw error;
    }
  }

  startSpan(name: string, options?: { attributes?: Record<string, unknown> }, context?: Context) {
    const parent = context ? trace.getSpanContext(context) : this.activeSpans.at(-1)?.spanContext();
    const span = new LocalSpanRecord({
      attributes: options?.attributes,
      caseKey: this.caseKey,
      name,
      parentSpanId: parent?.spanId,
      recorder: this.recorder,
      traceId: parent?.traceId,
    });

    return span;
  }
}

class LocalSpanRecord implements LiveSpan {
  readonly spanId = createHexId(16);
  readonly traceId: string;
  private readonly caseKey: string;
  private readonly events: SerializableSpanRecord['events'] = [];
  private readonly recorder: LiveCapabilityRecorder;
  private attributes: Record<string, unknown>;
  private ended = false;
  private name: string;
  private readonly parentSpanId?: string;
  private readonly startedAt = new Date().toISOString();
  private status?: unknown;

  constructor(options: {
    attributes?: Record<string, unknown>;
    caseKey: string;
    name: string;
    parentSpanId?: string;
    recorder: LiveCapabilityRecorder;
    traceId?: string;
  }) {
    this.attributes = (sanitizeForArtifact(options.attributes) ?? {}) as Record<string, unknown>;
    this.caseKey = options.caseKey;
    this.name = options.name;
    this.parentSpanId = options.parentSpanId;
    this.recorder = options.recorder;
    this.traceId = options.traceId ?? createHexId(32);
  }

  addEvent(name: string, attributes?: Record<string, unknown>) {
    this.events.push({
      name,
      timestamp: new Date().toISOString(),
      attributes: sanitizeForArtifact(attributes) as Record<string, unknown> | undefined,
    });
  }

  addLink() {
    return this;
  }

  addLinks() {
    return this;
  }

  end() {
    if (this.ended) {
      return;
    }

    this.ended = true;
    this.recorder.recordSpan({
      attributes: this.attributes,
      caseKey: this.caseKey,
      endedAt: new Date().toISOString(),
      events: this.events,
      name: this.name,
      parentSpanId: this.parentSpanId,
      spanId: this.spanId,
      startedAt: this.startedAt,
      status: sanitizeForArtifact(this.status),
      traceId: this.traceId,
    });
  }

  recordException(error: unknown) {
    this.addEvent('exception', {
      error: sanitizeForArtifact(error),
    });
  }

  isRecording() {
    return !this.ended;
  }

  setAttribute(key: string, value: unknown) {
    this.attributes[key] = sanitizeForArtifact(value);
    return this;
  }

  setAttributes(attributes: Record<string, unknown>) {
    for (const [key, value] of Object.entries(attributes)) {
      this.setAttribute(key, value);
    }

    return this;
  }

  setStatus(status: unknown) {
    this.status = sanitizeForArtifact(status);
    return this;
  }

  spanContext() {
    return {
      isRemote: false as const,
      spanId: this.spanId,
      traceFlags: 1 as const,
      traceId: this.traceId,
    };
  }

  updateName(name: string) {
    this.name = name;
    return this;
  }
}

function classifyCapabilityError(error: unknown): CapabilityStatus {
  if (error instanceof CapabilitySkippedError) {
    return 'skipped';
  }

  if (error instanceof CapabilityUnsupportedError) {
    return 'unsupported';
  }

  const serialized = sanitizeForArtifact(error) as Record<string, unknown>;
  const message =
    typeof serialized.message === 'string'
      ? serialized.message
      : typeof serialized.error === 'string'
        ? serialized.error
        : '';
  const statusCode =
    typeof serialized.statusCode === 'number'
      ? serialized.statusCode
      : typeof serialized.status === 'number'
        ? serialized.status
        : undefined;

  if (
    message.includes('NoSuchModelError') ||
    message.includes('embeddingModel') ||
    message.includes('imageModel') ||
    message.includes('unsupported')
  ) {
    return 'unsupported';
  }

  if (
    message.includes('LanguageModelService:InvalidRequest') ||
    message.includes('LanguageModelService') ||
    message.includes('APICallError') ||
    statusCode != null
  ) {
    return 'proxy-rejected';
  }

  return 'fail';
}

function createMarkdownSummary(record: CapabilityRunRecord) {
  const statusCounts = Object.entries(summarizeCaseStatuses(record.cases))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `\`${status}\`: ${count}`);
  const lines = [
    '# Harness Capability Results',
    '',
    `- Run ID: \`${record.runId}\``,
    `- Git SHA: \`${record.gitSha}\``,
    `- Package Version: \`${record.packageVersion}\``,
    `- Started: ${record.startedAt}`,
    `- Finished: ${record.finishedAt ?? 'in-progress'}`,
    `- Models: openai=\`${record.models.openai}\`, anthropic=\`${record.models.anthropic}\`, google=\`${record.models.google}\``,
    `- Model Overrides: ${formatOverrides(record.modelOverrides)}`,
    `- Filters: ${formatFilters(record.filters)}`,
    `- Status Counts: ${statusCounts.length > 0 ? statusCounts.join(', ') : 'none'}`,
    '',
    '| Provider | Capability | Status | Duration ms | Model |',
    '|---|---|---|---:|---|',
  ];

  for (const result of record.cases) {
    lines.push(
      `| ${result.provider} | ${result.capability} | ${result.status} | ${result.durationMs} | \`${result.modelId}\` |`,
    );
  }

  const failures = record.cases.filter((result) => result.status === 'fail');

  if (failures.length > 0) {
    lines.push('', '## Failures', '');

    for (const failure of failures) {
      const message =
        typeof (failure.error as { message?: unknown } | undefined)?.message === 'string'
          ? (failure.error as { message: string }).message
          : 'No message';
      lines.push(
        `- ${failure.provider}.${failure.capability} on \`${failure.modelId}\`: ${message}`,
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

function formatCapabilityStatusLabel(status: CapabilityStatus) {
  switch (status) {
    case 'pass':
      return 'PASS';
    case 'skipped':
      return 'SKIP';
    case 'unsupported':
      return 'UNSUPPORTED';
    case 'proxy-rejected':
      return 'PROXY-REJECTED';
    case 'fail':
      return 'FAIL';
  }
}

function summarizeCaseStatuses(cases: CapabilityResult[]) {
  return cases.reduce<Record<string, number>>((counts, result) => {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
    return counts;
  }, {});
}

function createRunId() {
  const timestamp = new Date().toISOString().replaceAll(':', '-');
  return `${timestamp}-${Math.random().toString(16).slice(2, 8)}`;
}

function createCaseKey(provider: LiveProvider, modelId: string, capability: string) {
  return `${provider}:${modelId}:${capability}`;
}

async function fetchVisionProbeImageBytes() {
  const response = await fetch(
    'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
  );

  if (!response.ok) {
    throw new Error(
      `Failed to fetch vision probe image: ${response.status} ${response.statusText}`,
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

function resolveGitSha() {
  try {
    return execSync('git rev-parse --short HEAD', {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return 'unknown';
  }
}

function resolveSdkVersions(): Record<string, string> {
  const require = createRequire(import.meta.url);
  return Object.fromEntries(
    ['ai', '@ai-sdk/openai', '@ai-sdk/anthropic', '@ai-sdk/google'].map((name) => [
      name,
      (require(`${name}/package.json`) as { version: string }).version,
    ]),
  );
}

function resolvePackageVersion() {
  try {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'packages/foundry-ai/package.json'), 'utf8'),
    ) as { version?: string };

    return typeof packageJson.version === 'string' ? packageJson.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

function getModelOverrides(): Partial<Record<LiveProvider, string>> {
  return Object.fromEntries(
    Object.entries(LIVE_MODELS_ENV)
      .map(([provider, envName]) => [provider, process.env[envName]?.trim()])
      .filter(([, value]) => value),
  ) as Partial<Record<LiveProvider, string>>;
}

function formatOverrides(overrides: Partial<Record<LiveProvider, string>>) {
  const entries = Object.entries(overrides);

  if (entries.length === 0) {
    return 'none';
  }

  return entries.map(([provider, modelId]) => `${provider}=\`${modelId}\``).join(', ');
}

function formatFilters(filters: LiveCapabilityFilters) {
  const entries = [
    filters.provider ? `provider=\`${filters.provider}\`` : undefined,
    filters.modelId ? `model=\`${filters.modelId}\`` : undefined,
  ].filter((value) => value != null);

  if (entries.length === 0) {
    return 'none';
  }

  return entries.join(', ');
}

function mergePreferredModelId(preferredModelId: string, modelIds: readonly string[]) {
  return Array.from(new Set([preferredModelId, ...modelIds]));
}

function filterLiveCapabilityModelMatrix(
  matrix: Record<LiveProvider, string[]>,
): Record<LiveProvider, string[]> {
  return {
    anthropic: matrix.anthropic.filter((modelId) =>
      shouldIncludeLiveCapabilityCase('anthropic', modelId),
    ),
    google: matrix.google.filter((modelId) => shouldIncludeLiveCapabilityCase('google', modelId)),
    openai: matrix.openai.filter((modelId) => shouldIncludeLiveCapabilityCase('openai', modelId)),
    'third-party': matrix['third-party'].filter((modelId) =>
      shouldIncludeLiveCapabilityCase('third-party', modelId),
    ),
  };
}

function isLiveProvider(value: string): value is LiveProvider {
  return (
    value === 'openai' || value === 'anthropic' || value === 'google' || value === 'third-party'
  );
}

function getKnownProviderModelIds(provider: LiveProvider): readonly string[] {
  return Object.entries(MODEL_CATALOG)
    .filter(
      ([, metadata]) =>
        metadata.provider === provider &&
        !metadata.inputTypes.some(
          (type) => type === 'OPEN_AI_EMBEDDINGS' || type === 'OPEN_AI_REALTIME',
        ),
    )
    .sort((left, right) => compareModelIds(right[0], left[0]))
    .map(([modelId]) => modelId);
}

function compareModelIds(left: string, right: string) {
  const leftParts = left.match(/\d+/g)?.map(Number) ?? [];
  const rightParts = right.match(/\d+/g)?.map(Number) ?? [];
  const partCount = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < partCount; index += 1) {
    const delta = (leftParts[index] ?? -1) - (rightParts[index] ?? -1);

    if (delta !== 0) {
      return delta;
    }
  }

  return left.localeCompare(right);
}

function normalizeSpanArgs(args: unknown[]) {
  let options: { attributes?: Record<string, unknown> } | undefined;
  let callback: ((span: LiveSpan) => unknown) | undefined;

  for (const arg of args) {
    if (typeof arg === 'function') {
      callback = arg as (span: LiveSpan) => unknown;
      continue;
    }

    if (arg != null && typeof arg === 'object' && !Array.isArray(arg)) {
      options = arg as { attributes?: Record<string, unknown> };
    }
  }

  return {
    callback,
    options,
  };
}

function sanitizeForArtifact(value: unknown, seen = new WeakSet<object>()): unknown {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (value instanceof Uint8Array) {
    return {
      type: 'Uint8Array',
      byteLength: value.byteLength,
      base64: Buffer.from(value).toString('base64'),
    };
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...(value.cause != null ? { cause: sanitizeForArtifact(value.cause, seen) } : {}),
      ...Object.fromEntries(
        Object.entries(value as unknown as Record<string, unknown>).map(([key, nested]) => [
          key,
          sanitizeForArtifact(nested, seen),
        ]),
      ),
    };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    return value.map((item) => sanitizeForArtifact(item, seen));
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) {
      return '[Circular]';
    }

    seen.add(value as object);

    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [
        key,
        sanitizeForArtifact(nested, seen),
      ]),
    );
  }

  return String(value);
}

function createHexId(length: number) {
  return Array.from({ length }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function isPromiseLike<T>(value: T | PromiseLike<T>): value is PromiseLike<T> {
  return (
    value != null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<T>).then === 'function'
  );
}
